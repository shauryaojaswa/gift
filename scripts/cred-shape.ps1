# Diagnostic: inspect the Credential Manager token SHAPE without printing it.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class JriqCred2 {
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

$out = @()
foreach ($target in @('Supabase CLI:supabase', 'Supabase CLI:supabase.com', 'supabase')) {
  foreach ($type in @(1, 0)) {
    $ptr = [IntPtr]::Zero
    $ok = [JriqCred2]::CredRead($target, $type, 0, [ref]$ptr)
    if ($ok) {
      $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][JriqCred2+CREDENTIAL])
      $blobSize = $cred.CredentialBlobSize
      $tok = [Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, [int]($blobSize / 2))
      [JriqCred2]::CredFree($ptr)
      $prefix = if ($tok.Length -ge 4) { $tok.Substring(0, 4) } else { '<short>' }
      $out += "target=$target type=$type blobBytes=$blobSize len=$($tok.Length) prefix=$prefix hasSpace=$($tok.Contains(' ')) hasNul=$($tok.Contains([char]0)) hasNewline=$($tok.Contains([char]10)) userName=$($cred.UserName)"
    } else {
      $out += "target=$target type=$type MISSING"
    }
  }
}
[System.IO.File]::WriteAllText('logs\cred-shape.txt', ($out -join "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output 'done'
