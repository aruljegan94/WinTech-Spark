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
 * with exact paper size matching and zero browser dialogs.
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
      widthMm = 50,
      heightMm = 30,
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
        widthMm: Number(widthMm) || 50,
        heightMm: Number(heightMm) || 30,
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

# Expand image paths according to copies if copies > 1
$allPages = @()
foreach ($p in $imgPaths) {
  for ($c = 0; $c -lt $copies; $c++) {
    $allPages += [string]$p
  }
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = [string]$cfg.jobTitle

if ($targetPrinter) {
  $doc.PrinterSettings.PrinterName = $targetPrinter
}

# If specified printer is not valid, try SR20 or default printer
if (-not $doc.PrinterSettings.IsValid) {
  $wmi = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -match 'SR20|PSF|POSIFLOW' } | Select-Object -First 1
  if ($wmi) {
    $doc.PrinterSettings.PrinterName = [string]$wmi.Name
  } else {
    $defPrinter = New-Object System.Drawing.Printing.PrinterSettings
    $doc.PrinterSettings.PrinterName = $defPrinter.PrinterName
  }
}

if (-not $doc.PrinterSettings.IsValid) {
  throw "Printer '$targetPrinter' is not installed or not valid on this Windows system."
}

$actualPrinterName = $doc.PrinterSettings.PrinterName
$isSr20Driver = ($actualPrinterName -match 'SR20|PSF|POSIFLOW')

# Convert requested mm to hundredths of an inch (1 inch = 25.4 mm => mm / 0.254)
$reqWidthHundredths = [int][math]::Round($reqWidthMm / 0.254)
$reqHeightHundredths = [int][math]::Round($reqHeightMm / 0.254)

# SR20 GPD driver has MaxSize PAIR(392, 600) at 203 DPI = 193 x 295 hundredths of an inch (49.048mm x 75.073mm)
# If printing to SR20, clamp the paper size to SR20 hardware bounds so the driver never rejects the job
if ($isSr20Driver) {
  $driverWidthHundredths = [math]::Min(193, [math]::Max(100, $reqWidthHundredths))
  $driverHeightHundredths = [math]::Min(295, [math]::Max(60, $reqHeightHundredths))
} else {
  $driverWidthHundredths = $reqWidthHundredths
  $driverHeightHundredths = $reqHeightHundredths
}

# Check if a native driver PaperSize matches the requested height (e.g. 50 x 20, 50 x 30, 50 x 40, 50 x 50)
$matchedPaper = $null
foreach ($psSize in $doc.PrinterSettings.PaperSizes) {
  $pHeightMm = $psSize.Height * 0.254
  $pWidthMm = $psSize.Width * 0.254
  if ([math]::Abs($pHeightMm - $reqHeightMm) -le 1.5 -and ($isSr20Driver -or [math]::Abs($pWidthMm - $reqWidthMm) -le 3.0)) {
    $matchedPaper = $psSize
    break
  }
}

if ($matchedPaper -ne $null) {
  $doc.DefaultPageSettings.PaperSize = $matchedPaper
} else {
  $customPaper = New-Object System.Drawing.Printing.PaperSize("SparkCustom", $driverWidthHundredths, $driverHeightHundredths)
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

    # Calculate draw width and height in hundredths of an inch
    $pageW = [float]$e.PageBounds.Width
    $pageH = [float]$e.PageBounds.Height
    if ($pageW -le 0) { $pageW = [float]$driverWidthHundredths }
    if ($pageH -le 0) { $pageH = [float]$driverHeightHundredths }

    # If the user selected a narrower label roll (e.g., 38mm) on the 49mm SR20 printhead, center it horizontally
    $drawW = [math]::Min($pageW, [float]$reqWidthHundredths)
    $drawH = [math]::Min($pageH, [float]$reqHeightHundredths)
    $offsetX = [math]::Max(0.0, ($pageW - $drawW) / 2.0)

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

Write-Output ("PRINTED_OK:" + $actualPrinterName + ":" + $allPages.Count)
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

    return NextResponse.json({
      success: true,
      printerName: usedPrinter,
      pagesPrinted: totalPrinted,
      widthMm,
      heightMm,
    });
  } catch (err: any) {
    console.error('Direct Windows Spooler print error:', err);
    return NextResponse.json(
      {
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
