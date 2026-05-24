$f = 'C:/Users/komm64/Projects/tutti/.output/chrome-mv3/manifest.json'
$c = Get-Content $f -Raw
$c = $c.Replace('"version":"0.5.7"', '"version":"0.5.7.99"')
[System.IO.File]::WriteAllText($f, $c)
(Get-Content $f -Raw).Substring(60, 50)
