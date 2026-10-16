param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [string]$Sql,
  [string]$SqlFile,
  [Parameter(Mandatory = $true)][string]$OutLog
)

# Supabase Management API SQL runner (staging/production).
# The access token is read from Windows Credential Manager (target
# "Supabase CLI:supabase") and is never printed or logged.

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JriqCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credPtr);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
}
"@

$ptr = [IntPtr]::Zero
if (-not [JriqCred]::CredRead('Supabase CLI:supabase', 1, 0, [ref]$ptr)) {
  Write-Error 'Credential "Supabase CLI:supabase" not found'
  exit 2
}
$cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][JriqCred+CREDENTIAL])
# The blob is a UTF-8 byte string (not UTF-16): copy the raw bytes and decode.
$blobBytes = New-Object byte[] $cred.CredentialBlobSize
[Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blobBytes, 0, $cred.CredentialBlobSize)
[JriqCred]::CredFree($ptr)
$token = [System.Text.Encoding]::UTF8.GetString($blobBytes).Trim([char]0, [char]10, [char]13, [char]32)
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error 'Credential blob empty'
  exit 2
}

if ($SqlFile) {
  $q = [System.IO.File]::ReadAllText($SqlFile)
} else {
  $q = $Sql
}

$body = '{"query":' + (ConvertTo-Json -InputObject ([string]$q)) + '}'
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}
$uri = "https://api.supabase.com/v1/projects/$Ref/database/query"

try {
  $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -TimeoutSec 120
  $json = $resp | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($OutLog, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Output "OK -> $OutLog"
  exit 0
} catch {
  $msg = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $msg + ' | ' + $_.ErrorDetails.Message }
  [System.IO.File]::WriteAllText($OutLog, "ERROR: $msg", [System.Text.UTF8Encoding]::new($false))
  Write-Output "FAILED -> $OutLog"
  exit 1
}
