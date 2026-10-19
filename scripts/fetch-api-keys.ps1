param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [Parameter(Mandatory = $true)][string]$OutFile
)

# Scratch helper (untracked): fetch a Supabase project's API keys via the
# Management API and write them as JSON {url, anon, service} to $OutFile.
# The access token is read from Windows Credential Manager (target
# "Supabase CLI:supabase"); key values are NEVER printed to the console.

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JriqCredK {
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
if (-not [JriqCredK]::CredRead('Supabase CLI:supabase', 1, 0, [ref]$ptr)) {
  Write-Error 'Credential "Supabase CLI:supabase" not found'
  exit 2
}
$cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][JriqCredK+CREDENTIAL])
$blobBytes = New-Object byte[] $cred.CredentialBlobSize
[Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $blobBytes, 0, $cred.CredentialBlobSize)
[JriqCredK]::CredFree($ptr)
$token = [System.Text.Encoding]::UTF8.GetString($blobBytes).Trim([char]0, [char]10, [char]13, [char]32)
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error 'Credential blob empty'
  exit 2
}

$resp = Invoke-RestMethod -Method Get `
  -Uri "https://api.supabase.com/v1/projects/$Ref/api-keys" `
  -Headers @{ Authorization = "Bearer $token"; Accept = 'application/json' }

$anon = $null
$service = $null
foreach ($k in $resp) {
  $name = [string]$k.name
  if ($name -eq 'anon' -or $name -eq 'publishable') { if (-not $anon) { $anon = [string]$k.api_key } }
  if ($name -eq 'service_role' -or $name -eq 'secret') { if (-not $service) { $service = [string]$k.api_key } }
}
if (-not $anon -or -not $service) {
  Write-Error "API key discovery failed (names: $(($resp | ForEach-Object { $_.name }) -join ','))"
  exit 3
}

$payload = [ordered]@{
  url     = "https://$Ref.supabase.co"
  anon    = $anon
  service = $service
} | ConvertTo-Json
$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
[System.IO.File]::WriteAllText($OutFile, $payload, [System.Text.UTF8Encoding]::new($false))
Write-Output "keys written for $Ref -> $OutFile (anon $($anon.Length) chars, service $($service.Length) chars; values not shown)"
