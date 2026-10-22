import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface WindowsPrinterInfo {
  name: string;
  driverName: string;
  portName: string;
  status: string;
  isDefault: boolean;
  isPsf20: boolean;
  paperSizes: {
    name: string;
    widthMm: number;
    heightMm: number;
    widthHundredthsInch: number;
    heightHundredthsInch: number;
  }[];
}

/**
 * GET /api/printer
 * Detects installed Windows printers (specifically POSIFLOW PSF-20 / SR20 thermal printer)
 * and returns their status, port, driver, and supported paper sizes.
 */
export async function GET() {
  if (process.platform !== 'win32') {
    return NextResponse.json({
      supported: false,
      platform: process.platform,
      printers: [],
      recommendedPrinter: null,
      message: 'Direct Windows Spooler API is only available on Windows hosts.',
    });
  }

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

$wmiPrinters = Get-CimInstance -ClassName Win32_Printer
$result = @()

foreach ($p in $wmiPrinters) {
  $name = $p.Name
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

  $isPsf = ($name -match 'SR20|PSF|POSIFLOW|Label|Thermal|POS|58|80') -or ($p.DriverName -match 'SR20|PSF|POSIFLOW')
  $statusStr = 'Ready'
  if ($p.WorkOffline) {
    $statusStr = 'Offline'
  } elseif ($p.PrinterStatus -eq 3) {
    $statusStr = 'Ready'
  } elseif ($p.PrinterStatus -eq 4) {
    $statusStr = 'Printing'
  }

  $result += @{
    name = [string]$name
    driverName = [string]$p.DriverName
    portName = [string]$p.PortName
    status = $statusStr
    isDefault = [bool]$p.Default
    isPsf20 = [bool]$isPsf
    paperSizes = $sizes
  }
}

ConvertTo-Json -InputObject @($result) -Depth 4 -Compress
`;

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }
    );

    const trimmed = (stdout || '').trim();
    let printers: WindowsPrinterInfo[] = [];
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      printers = Array.isArray(parsed) ? parsed : [parsed];
    }

    // Prioritize SR20 / PSF20 printer, then default printer
    const recommended =
      printers.find((p) => /SR20|PSF|POSIFLOW/i.test(p.name) || /SR20|PSF|POSIFLOW/i.test(p.driverName)) ||
      printers.find((p) => p.isPsf20) ||
      printers.find((p) => p.isDefault) ||
      printers[0] ||
      null;

    return NextResponse.json({
      supported: true,
      platform: process.platform,
      printers,
      recommendedPrinter: recommended?.name || null,
    });
  } catch (err: any) {
    console.error('Error querying Windows printers:', err);
    return NextResponse.json(
      {
        supported: false,
        platform: process.platform,
        printers: [],
        recommendedPrinter: null,
        error: err?.message || 'Failed to query Windows printers.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/printer
 * Prints 1 or more rendered 203-DPI bitmap pages directly to the specified Windows printer
 * (e.g., SR20 / POSIFLOW PSF-20 on USB001) using .NET System.Drawing.Printing.PrintDocument
 * and Set-PrintConfiguration PrintTicketXML so full-length continuous receipts and labels
 * print at 1:1 scale without clipping to 30mm.
 */
export async function POST(req: NextRequest) {
  if (process.platform !== 'win32') {
    return NextResponse.json(
      {
        success: false,
        error: 'Direct Windows Spooler printing is only available when running on Windows.',
      },
      { status: 400 }
    );
  }

  let tempDir = '';
  try {
    const body = await req.json();
    const {
      printerName = 'SR20',
      pages = [],
      widthMm = 55,
      heightMm = 0,
      copies = 1,
      jobTitle = 'WinTech_Spark_Thermal_Print',
    } = body as {
      printerName?: string;
      pages: string[];
      widthMm?: number;
      heightMm?: number;
      copies?: number;
      jobTitle?: string;
    };

    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No print pages provided.' },
        { status: 400 }
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spark-psf20-'));
    const imagePaths: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      const dataUrl = pages[i];
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const imgPath = path.join(tempDir, `page_${i}.png`);
      await fs.writeFile(imgPath, Buffer.from(base64Data, 'base64'));
      imagePaths.push(imgPath);
    }

    const jobConfigPath = path.join(tempDir, 'job.json');
    await fs.writeFile(
      jobConfigPath,
      JSON.stringify({
        printerName,
        widthMm: Number(widthMm) || 55,
        heightMm: Number(heightMm) || 0,
        copies: Math.max(1, Math.min(100, Number(copies) || 1)),
        jobTitle: String(jobTitle || 'WinTech_Spark_Print'),
        imagePaths,
      }),
      'utf-8'
    );

    const psScriptPath = path.join(tempDir, 'print.ps1');
    const psScriptContent = `
param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$targetPrinter = [string]$cfg.printerName
$reqWidthMm = [double]$cfg.widthMm
$reqHeightMm = [double]$cfg.heightMm
$copies = [int]$cfg.copies
$imgPaths = @($cfg.imagePaths)

$allWmiPrinters = @(Get-CimInstance -ClassName Win32_Printer)
$probeSettings = New-Object System.Drawing.Printing.PrinterSettings
if ($targetPrinter) {
  $probeSettings.PrinterName = $targetPrinter
}
if (-not $probeSettings.IsValid) {
  $wmi = $allWmiPrinters | Where-Object { ($_.Name -match 'SR20|PSF|POSIFLOW|Shreyans|Label|Thermal|POS') -or ($_.DriverName -match 'SR20|PSF|POSIFLOW|Shreyans') } | Select-Object -First 1
  if ($wmi) {
    $probeSettings.PrinterName = [string]$wmi.Name
  } else {
    $defPrinter = New-Object System.Drawing.Printing.PrinterSettings
    $probeSettings.PrinterName = $defPrinter.PrinterName
  }
}
if (-not $probeSettings.IsValid) {
  throw "Printer '$targetPrinter' is not installed or not valid on this Windows system."
}

$actualPrinterName = $probeSettings.PrinterName
$matchedWmi = $allWmiPrinters | Where-Object { $_.Name -eq $actualPrinterName } | Select-Object -First 1
$actualDriverName = if ($matchedWmi) { [string]$matchedWmi.DriverName } else { "" }
$isSr20Driver = ($actualPrinterName -match 'SR20|PSF|POSIFLOW|Shreyans') -or ($actualDriverName -match 'SR20|PSF|POSIFLOW|Shreyans')

# SR20 printable width is 49.048mm (193 hundredths of an inch).
# For 50mm, 55mm, 57mm, 58mm rolls on SR20, we use the full 49.048mm printhead width.
$effectiveWidthMm = if ($isSr20Driver) {
  if ($reqWidthMm -lt 45) { $reqWidthMm } else { 49.0 }
} else {
  $reqWidthMm
}

# Inspect the first image to calculate true physical height from its aspect ratio if continuous roll (heightMm <= 0 or > 75)
$slicePaths = @()
$sliceHeightMm = $reqHeightMm

foreach ($srcPath in $imgPaths) {
  $srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
  try {
    $imgW = [double]$srcImg.Width
    $imgH = [double]$srcImg.Height
    $calcHeightMm = [math]::Round($effectiveWidthMm * ($imgH / $imgW), 1)

    # On SR20, GPD MaxSize height per page is 75.073mm (600 dots @ 203 DPI).
    # If a continuous receipt is taller than 74mm on SR20, slice it into 74mm vertical bands at 1:1 scale so it never squashes or clips!
    if ($isSr20Driver -and ($reqHeightMm -le 0 -or $reqHeightMm -gt 74) -and $calcHeightMm -gt 74.5) {
      $bandMm = 74.0
      $sliceHeightMm = $bandMm
      $pxPerMm = $imgW / $effectiveWidthMm
      $bandPx = [int][math]::Round($bandMm * $pxPerMm)
      $offsetY = 0
      $partIdx = 0
      while ($offsetY -lt $srcImg.Height) {
        $thisSlicePx = [math]::Min($bandPx, $srcImg.Height - $offsetY)
        $thisSliceMm = [math]::Max(20.0, [math]::Round($thisSlicePx / $pxPerMm, 1))
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

# Expand according to copies
$allPages = @()
for ($c = 0; $c -lt $copies; $c++) {
  foreach ($p in $slicePaths) {
    $allPages += [string]$p
  }
}

# Update SR20 Windows PrintTicketXML so Unidrv sets VisibleClipBounds to the exact receipt/label height (up to 74mm) instead of clipping at 30mm!
$origPrintTicketXml = $null
$paperLabelUsed = "$($effectiveWidthMm)x$($sliceHeightMm)mm"
if ($isSr20Driver) {
  try {
    $pc = Get-PrintConfiguration -PrinterName $actualPrinterName
    $origPrintTicketXml = $pc.PrintTicketXML
    $heightMicrons = [int][math]::Round($sliceHeightMm * 1000)
    if ($heightMicrons -gt 74500) { $heightMicrons = 74500 }
    if ($heightMicrons -lt 20000) { $heightMicrons = 20000 }

    $mediaOptionXml = "<psf:Feature name=\`"psk:PageMediaSize\`"><psf:Option name=\`"psk:CustomMediaSize\`"><psf:ScoredProperty name=\`"psk:MediaSizeWidth\`"><psf:Value xsi:type=\`"xsd:integer\`">49048</psf:Value></psf:ScoredProperty><psf:ScoredProperty name=\`"psk:MediaSizeHeight\`"><psf:Value xsi:type=\`"xsd:integer\`">$heightMicrons</psf:Value></psf:ScoredProperty></psf:Option></psf:Feature>"
    $updatedXml = [regex]::Replace(
      $origPrintTicketXml,
      '<psf:Feature name="psk:PageMediaSize">.*?</psf:Feature>',
      $mediaOptionXml,
      [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    Set-PrintConfiguration -PrinterName $actualPrinterName -PrintTicketXml $updatedXml
    $paperLabelUsed = "SR20 49x$([math]::Round($sliceHeightMm))mm Roll"
  } catch {
    # Continue if PrintConfiguration is unavailable
  }
}

try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = [string]$cfg.jobTitle
  $doc.PrinterSettings.PrinterName = $actualPrinterName

  $reqWidthHundredths = [int][math]::Round($effectiveWidthMm / 0.254)
  $reqHeightHundredths = [int][math]::Round($sliceHeightMm / 0.254)

  if (-not $isSr20Driver) {
    $customPaper = New-Object System.Drawing.Printing.PaperSize("SparkReceipt", $reqWidthHundredths, $reqHeightHundredths)
    $doc.DefaultPageSettings.PaperSize = $customPaper
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

      # Draw at exact 1:1 width-to-height aspect ratio so text is never squashed vertically
      $drawW = [math]::Min($clipW, [float]$reqWidthHundredths)
      $aspectRatio = [float]$img.Height / [float]$img.Width
      $drawH = $drawW * $aspectRatio
      if ($drawH -gt $clipH) {
        $drawH = $clipH
      }
      $offsetX = [math]::Max(0.0, ($clipW - $drawW) / 2.0)

      $rect = New-Object System.Drawing.RectangleF($offsetX, 0.0, $drawW, $drawH)
      $e.Graphics.DrawImage($img, $rect)
    } finally {
      $img.Dispose()
    }

    $script:pageIndex++
    if ($script:pageIndex -lt $allPages.Count) {
      $e.HasMorePages = $true
    } else {
      $e.HasMorePages = $false
    }
  })

  $doc.Print()
  $doc.Dispose()
} finally {
  if ($origPrintTicketXml -ne $null) {
    try {
      Set-PrintConfiguration -PrinterName $actualPrinterName -PrintTicketXml $origPrintTicketXml
    } catch {}
  }
}

Write-Output ("PRINTED_OK:" + $actualPrinterName + ":" + $allPages.Count + ":" + $paperLabelUsed)
`;

    await fs.writeFile(psScriptPath, psScriptContent, 'utf-8');

    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath, jobConfigPath],
      { timeout: 25000, maxBuffer: 5 * 1024 * 1024 }
    );

    const outStr = (stdout || '').trim();
    if (!outStr.includes('PRINTED_OK:')) {
      throw new Error(stderr || outStr || 'Windows print spooler did not confirm print job.');
    }

    const parts = outStr.split('PRINTED_OK:')[1]?.split(':') || [];
    const usedPrinter = parts[0] || printerName;
    const totalPrinted = Number(parts[1]) || pages.length;
    const paperName = parts[2] || `${widthMm}mm Roll`;

    return NextResponse.json({
      ok: true,
      success: true,
      printerName: usedPrinter,
      paperName,
      pagesPrinted: totalPrinted,
      widthMm,
      heightMm,
    });
  } catch (err: any) {
    console.error('Direct Windows Spooler print error:', err);
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Failed to print via Windows Spooler.',
      },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}
