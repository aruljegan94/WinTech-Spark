# WinTech-Spark Local Windows Direct Print Bridge (Port 18181)
# Enables https://spark-winauto.vercel.app (and any browser) to print 100% directly
# to the local USB POSIFLOW PSF-20 (SR20) thermal printer without opening browser print dialogs.

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing

$port = 18181
$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $port)
$listener = New-Object System.Net.Sockets.TcpListener($endpoint)

try {
  $listener.Start()
} catch {
  # Port 18181 is already running another instance
  exit 0
}

# Configure SR20 default PrintTicketXML to 49x74.5mm Full-Length Roll on startup
try {
  $srPrinter = Get-CimInstance -ClassName Win32_Printer | Where-Object { ($_.Name -match 'SR20|PSF|POSIFLOW|Shreyans') -or ($_.DriverName -match 'SR20|PSF|POSIFLOW|Shreyans') } | Select-Object -First 1
  if ($srPrinter) {
    $pc = Get-PrintConfiguration -PrinterName $srPrinter.Name
    $mediaOptionXml = '<psf:Feature name="psk:PageMediaSize"><psf:Option name="psk:CustomMediaSize"><psf:ScoredProperty name="psk:MediaSizeWidth"><psf:Value xsi:type="xsd:integer">49048</psf:Value></psf:ScoredProperty><psf:ScoredProperty name="psk:MediaSizeHeight"><psf:Value xsi:type="xsd:integer">74500</psf:Value></psf:ScoredProperty></psf:Option></psf:Feature>'
    $updatedXml = [regex]::Replace($pc.PrintTicketXML, '<psf:Feature name="psk:PageMediaSize">.*?</psf:Feature>', $mediaOptionXml, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    Set-PrintConfiguration -PrinterName $srPrinter.Name -PrintTicketXml $updatedXml
  }
} catch {}

function Send-HttpResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode = 200,
    [string]$StatusText = "OK",
    [string]$JsonBody = ""
  )
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText",
    "Content-Type: application/json; charset=utf-8",
    "Content-Length: $($bodyBytes.Length)",
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Methods: GET, POST, OPTIONS",
    "Access-Control-Allow-Headers: Content-Type, Authorization",
    "Access-Control-Allow-Private-Network: true",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($bodyBytes.Length -gt 0) {
    $Stream.Write($bodyBytes, 0, $bodyBytes.Length)
  }
  $Stream.Flush()
}

function Get-PrintersJson {
  $wmiPrinters = @(Get-CimInstance -ClassName Win32_Printer)
  $result = @()
  foreach ($p in $wmiPrinters) {
    $name = [string]$p.Name
    $ps = New-Object System.Drawing.Printing.PrinterSettings
    $ps.PrinterName = $name
    $sizes = @()
    if ($ps.IsValid) {
      foreach ($sz in $ps.PaperSizes) {
        $sizes += @{
          name = [string]$sz.PaperName
          widthMm = [math]::Round($sz.Width * 0.254, 1)
          heightMm = [math]::Round($sz.Height * 0.254, 1)
          widthHundredthsInch = [int]$sz.Width
          heightHundredthsInch = [int]$sz.Height
        }
      }
    }
    $isPsf = ($name -match 'SR20|PSF|POSIFLOW|Label|Thermal|POS|58|80') -or ($p.DriverName -match 'SR20|PSF|POSIFLOW|Shreyans')
    $statusStr = if ($p.WorkOffline) { 'Offline' } else { 'Ready' }
    $result += @{
      name = $name
      driverName = [string]$p.DriverName
      portName = [string]$p.PortName
      status = $statusStr
      isDefault = [bool]$p.Default
      isPsf20 = [bool]$isPsf
      paperSizes = $sizes
    }
  }
  $rec = $result | Where-Object { $_.name -match 'SR20|PSF|POSIFLOW' -or $_.driverName -match 'SR20|PSF|POSIFLOW' } | Select-Object -First 1
  if (-not $rec) { $rec = $result | Where-Object { $_.isPsf20 } | Select-Object -First 1 }
  if (-not $rec) { $rec = $result | Where-Object { $_.isDefault } | Select-Object -First 1 }
  if (-not $rec -and $result.Count -gt 0) { $rec = $result[0] }

  $payload = @{
    supported = $true
    platform = 'win32'
    printers = @($result)
    recommendedPrinter = if ($rec) { $rec.name } else { $null }
  }
  return (ConvertTo-Json -InputObject $payload -Depth 5 -Compress)
}

function Invoke-DirectPrintJob {
  param([string]$BodyJson)
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("spark-bridge-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  try {
    $cfg = $BodyJson | ConvertFrom-Json
    $targetPrinter = if ($cfg.printerName) { [string]$cfg.printerName } else { "SR20" }
    $reqWidthMm = if ($cfg.widthMm) { [double]$cfg.widthMm } else { 55.0 }
    $reqHeightMm = if ($cfg.heightMm) { [double]$cfg.heightMm } else { 0.0 }
    $copies = if ($cfg.copies) { [Math]::Max(1, [int]$cfg.copies) } else { 1 }
    $jobTitle = if ($cfg.jobTitle) { [string]$cfg.jobTitle } else { "WinTech_Spark_Print" }
    $pages = @($cfg.pages)

    $imgPaths = @()
    for ($i = 0; $i -lt $pages.Count; $i++) {
      $b64 = ($pages[$i] -replace '^data:image/\w+;base64,', '')
      $pPath = Join-Path $tempDir "page_$i.png"
      [System.IO.File]::WriteAllBytes($pPath, [Convert]::FromBase64String($b64))
      $imgPaths += $pPath
    }

    $allWmiPrinters = @(Get-CimInstance -ClassName Win32_Printer)
    $probeSettings = New-Object System.Drawing.Printing.PrinterSettings
    if ($targetPrinter) { $probeSettings.PrinterName = $targetPrinter }
    if (-not $probeSettings.IsValid) {
      $wmi = $allWmiPrinters | Where-Object { ($_.Name -match 'SR20|PSF|POSIFLOW|Shreyans|Label|Thermal|POS') -or ($_.DriverName -match 'SR20|PSF|POSIFLOW|Shreyans') } | Select-Object -First 1
      if ($wmi) { $probeSettings.PrinterName = [string]$wmi.Name }
    }
    $actualPrinterName = $probeSettings.PrinterName
    $matchedWmi = $allWmiPrinters | Where-Object { $_.Name -eq $actualPrinterName } | Select-Object -First 1
    $actualDriverName = if ($matchedWmi) { [string]$matchedWmi.DriverName } else { "" }
    $isSr20Driver = ($actualPrinterName -match 'SR20|PSF|POSIFLOW|Shreyans') -or ($actualDriverName -match 'SR20|PSF|POSIFLOW|Shreyans')

    $effectiveWidthMm = if ($isSr20Driver) { if ($reqWidthMm -lt 45) { $reqWidthMm } else { 49.0 } } else { $reqWidthMm }
    $slicePaths = @()
    $sliceHeightMm = $reqHeightMm

    foreach ($srcPath in $imgPaths) {
      $srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
      try {
        $imgW = [double]$srcImg.Width
        $imgH = [double]$srcImg.Height
        $calcHeightMm = [math]::Round($effectiveWidthMm * ($imgH / $imgW), 1)

        if ($isSr20Driver -and ($reqHeightMm -le 0 -or $reqHeightMm -gt 74) -and $calcHeightMm -gt 74.5) {
          $bandMm = 74.0
          $sliceHeightMm = $bandMm
          $pxPerMm = $imgW / $effectiveWidthMm
          $bandPx = [int][math]::Round($bandMm * $pxPerMm)
          $offsetY = 0
          $partIdx = 0
          while ($offsetY -lt $srcImg.Height) {
            $thisSlicePx = [math]::Min($bandPx, $srcImg.Height - $offsetY)
            $bmpHeightPx = [int][math]::Round($bandMm * $pxPerMm)
            $sliceBmp = New-Object System.Drawing.Bitmap($srcImg.Width, $bmpHeightPx)
            $g = [System.Drawing.Graphics]::FromImage($sliceBmp)
            try {
              $g.Clear([System.Drawing.Color]::White)
              $srcRect = New-Object System.Drawing.Rectangle(0, $offsetY, $srcImg.Width, $thisSlicePx)
              $destRect = New-Object System.Drawing.Rectangle(0, 0, $srcImg.Width, $thisSlicePx)
              $g.DrawImage($srcImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
            } finally {
              $g.Dispose()
            }
            $slicePath = "$srcPath.band_$partIdx.png"
            $sliceBmp.Save($slicePath, [System.Drawing.Imaging.ImageFormat]::Png)
            $sliceBmp.Dispose()
            $slicePaths += $slicePath
            $offsetY += $thisSlicePx
            $partIdx++
          }
        } else {
          if ($reqHeightMm -le 0 -or $reqHeightMm -gt 74) {
            $sliceHeightMm = [math]::Max(25.0, [math]::Min(74.0, $calcHeightMm))
          } else {
            $sliceHeightMm = [math]::Max(20.0, [math]::Min(74.0, $reqHeightMm))
          }
          $slicePaths += $srcPath
        }
      } finally {
        $srcImg.Dispose()
      }
    }

    $allPages = @()
    for ($c = 0; $c -lt $copies; $c++) {
      foreach ($p in $slicePaths) { $allPages += [string]$p }
    }

    $paperLabelUsed = "$($effectiveWidthMm)x$($sliceHeightMm)mm"
    if ($isSr20Driver) {
      try {
        $pc = Get-PrintConfiguration -PrinterName $actualPrinterName
        $heightMicrons = [int][math]::Round($sliceHeightMm * 1000)
        if ($heightMicrons -gt 74500) { $heightMicrons = 74500 }
        if ($heightMicrons -lt 20000) { $heightMicrons = 20000 }
        $mediaOptionXml = "<psf:Feature name=\`"psk:PageMediaSize\`"><psf:Option name=\`"psk:CustomMediaSize\`"><psf:ScoredProperty name=\`"psk:MediaSizeWidth\`"><psf:Value xsi:type=\`"xsd:integer\`">49048</psf:Value></psf:ScoredProperty><psf:ScoredProperty name=\`"psk:MediaSizeHeight\`"><psf:Value xsi:type=\`"xsd:integer\`">$heightMicrons</psf:Value></psf:ScoredProperty></psf:Option></psf:Feature>"
        $updatedXml = [regex]::Replace($pc.PrintTicketXML, '<psf:Feature name="psk:PageMediaSize">.*?</psf:Feature>', $mediaOptionXml, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        Set-PrintConfiguration -PrinterName $actualPrinterName -PrintTicketXml $updatedXml
        $paperLabelUsed = "SR20 49x$([math]::Round($sliceHeightMm))mm Roll"
      } catch {}
    }

    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = $jobTitle
    $doc.PrinterSettings.PrinterName = $actualPrinterName
    $reqWidthHundredths = [int][math]::Round($effectiveWidthMm / 0.254)
    $reqHeightHundredths = [int][math]::Round($sliceHeightMm / 0.254)
    if (-not $isSr20Driver) {
      $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("SparkReceipt", $reqWidthHundredths, $reqHeightHundredths)
    }
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $doc.DefaultPageSettings.Landscape = $false
    $doc.OriginAtMargins = $false
    $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

    $script:pageIndex = 0
    $doc.add_PrintPage({
      param($sender, $e)
      $currentPath = $allPages[$script:pageIndex]
      $img = [System.Drawing.Image]::FromFile($currentPath)
      try {
        $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
        $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $e.Graphics.Clear([System.Drawing.Color]::White)

        $clipW = [float]$e.Graphics.VisibleClipBounds.Width
        $clipH = [float]$e.Graphics.VisibleClipBounds.Height
        if ($clipW -le 0) { $clipW = [float]$reqWidthHundredths }
        if ($clipH -le 0) { $clipH = [float]$reqHeightHundredths }

        $drawW = [math]::Min($clipW, [float]$reqWidthHundredths)
        $aspectRatio = [float]$img.Height / [float]$img.Width
        $drawH = $drawW * $aspectRatio
        if ($drawH -gt $clipH) { $drawH = $clipH }
        $offsetX = [math]::Max(0.0, ($clipW - $drawW) / 2.0)

        $rect = New-Object System.Drawing.RectangleF($offsetX, 0.0, $drawW, $drawH)
        $e.Graphics.DrawImage($img, $rect)
      } finally {
        $img.Dispose()
      }
      $script:pageIndex++
      $e.HasMorePages = ($script:pageIndex -lt $allPages.Count)
    })

    $doc.Print()
    $doc.Dispose()

    return (ConvertTo-Json -InputObject @{
      ok = $true
      success = $true
      printerName = $actualPrinterName
      paperName = $paperLabelUsed
      pagesPrinted = $allPages.Count
    } -Compress)
  } finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

while ($true) {
  try {
    $client = $listener.AcceptTcpClient()
    $client.ReceiveTimeout = 10000
    $client.SendTimeout = 10000
    $stream = $client.GetStream()
    try {
      $ms = New-Object System.IO.MemoryStream
      $buf = New-Object byte[] 8192
      $headerEndIdx = -1
      $contentLength = 0
      $method = "GET"

      while ($true) {
        $read = $stream.Read($buf, 0, $buf.Length)
        if ($read -le 0) { break }
        $ms.Write($buf, 0, $read)
        $allBytes = $ms.ToArray()
        if ($headerEndIdx -lt 0) {
          $ascii = [System.Text.Encoding]::ASCII.GetString($allBytes)
          $idx = $ascii.IndexOf("`r`n`r`n")
          if ($idx -ge 0) {
            $headerEndIdx = $idx + 4
            $headerLines = $ascii.Substring(0, $idx) -split "`r`n"
            if ($headerLines.Count -gt 0) {
              $parts = $headerLines[0] -split " "
              if ($parts.Count -ge 1) { $method = $parts[0].ToUpper() }
            }
            foreach ($hl in $headerLines) {
              if ($hl -match '^Content-Length:\s*(\d+)') {
                $contentLength = [int]$Matches[1]
              }
            }
          }
        }
        if ($headerEndIdx -ge 0 -and ($ms.Length - $headerEndIdx) -ge $contentLength) {
          break
        }
      }

      if ($method -eq "OPTIONS") {
        Send-HttpResponse -Stream $stream -StatusCode 204 -StatusText "No Content" -JsonBody ""
      } elseif ($method -eq "GET") {
        $json = Get-PrintersJson
        Send-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -JsonBody $json
      } elseif ($method -eq "POST") {
        $allBytes = $ms.ToArray()
        $bodyStr = [System.Text.Encoding]::UTF8.GetString($allBytes, $headerEndIdx, $allBytes.Length - $headerEndIdx)
        $resJson = Invoke-DirectPrintJob -BodyJson $bodyStr
        Send-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -JsonBody $resJson
      } else {
        Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -JsonBody '{"ok":false}'
      }
    } catch {
      $errJson = ConvertTo-Json -InputObject @{ ok = $false; success = $false; error = $_.Exception.Message } -Compress
      try { Send-HttpResponse -Stream $stream -StatusCode 500 -StatusText "Internal Server Error" -JsonBody $errJson } catch {}
    } finally {
      $stream.Close()
      $client.Close()
    }
  } catch {
    Start-Sleep -Milliseconds 100
  }
}
