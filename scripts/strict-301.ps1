# Strict redirect probe: statuses + Location headers inspected AS SERVED
# (AllowAutoRedirect=false). Evidence for the legacy-301 and SPA rows.
param([string]$OutLog = 'logs\strict-301.log')

$urls = @(
  'https://jriq.in/',
  'https://jriq.in/store/jolly-enterprises',
  'https://jriq.in/jolly-enterprises',
  'https://jriq.in/jolly-enterprises/admin',
  'https://jriq.in/no-such-shop-zzz'
)

$lines = @()
foreach ($u in $urls) {
  $r = [System.Net.HttpWebRequest]::Create($u)
  $r.AllowAutoRedirect = $false
  $r.Timeout = 30000
  try {
    $resp = $r.GetResponse()
    $loc = $resp.Headers['Location']
    $lines += ('{0} -> {1} Location={2}' -f $u, [int]$resp.StatusCode, $(if ($loc) { $loc } else { '-' }))
    $resp.Close()
  } catch {
    $e = $_.Exception.Response
    if ($e) {
      $loc = $e.Headers['Location']
      $lines += ('{0} -> {1} Location={2}' -f $u, [int]$e.StatusCode, $(if ($loc) { $loc } else { '-' }))
    } else {
      $lines += ('{0} -> ERROR {1}' -f $u, $_.Exception.Message)
    }
  }
}

[System.IO.File]::WriteAllText($OutLog, ($lines -join "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output ($lines -join "`n")
