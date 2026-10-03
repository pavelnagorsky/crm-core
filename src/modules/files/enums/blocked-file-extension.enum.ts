/**
 * Dangerous file extensions that are rejected on upload.
 * Everything not listed here is allowed — this is a blocklist, not an allowlist.
 * Covers native executables, scripts, installers and other directly-runnable content.
 */
export enum BlockedFileExtension {
  // Windows executables / libraries / installers
  EXE = 'exe',
  MSI = 'msi',
  DLL = 'dll',
  SCR = 'scr',
  COM = 'com',
  CPL = 'cpl',
  MSC = 'msc',
  SYS = 'sys',
  DRV = 'drv',

  // Scripts (Windows)
  BAT = 'bat',
  CMD = 'cmd',
  PS1 = 'ps1',
  PSM1 = 'psm1',
  VBS = 'vbs',
  VBE = 'vbe',
  JS = 'js',
  JSE = 'jse',
  WSF = 'wsf',
  WSH = 'wsh',
  HTA = 'hta',
  REG = 'reg',
  LNK = 'lnk',
  SCF = 'scf',

  // Scripts (Unix / cross-platform)
  SH = 'sh',
  BASH = 'bash',
  ZSH = 'zsh',
  CSH = 'csh',
  KSH = 'ksh',
  RUN = 'run',

  // macOS / mobile / other executables & packages
  APP = 'app',
  DMG = 'dmg',
  PKG = 'pkg',
  DEB = 'deb',
  RPM = 'rpm',
  APK = 'apk',
  JAR = 'jar',

  // Office macro-enabled documents
  DOCM = 'docm',
  XLSM = 'xlsm',
  PPTM = 'pptm',
  DOTM = 'dotm',
  XLTM = 'xltm',
  POTM = 'potm',

  // Active web content — served inline from the public bucket URL, so these
  // would execute scripts in the bucket origin (stored XSS). Images are served
  // inline intentionally; these active types must never be.
  HTML = 'html',
  HTM = 'htm',
  XHTML = 'xhtml',
  SHTML = 'shtml',
  SVG = 'svg',
  XML = 'xml',
  MHTML = 'mhtml',
  MHT = 'mht',
  SWF = 'swf',

  // Server-side scripts
  PHP = 'php',
  PHTML = 'phtml',
  PHT = 'pht',
  PHAR = 'phar',
  ASP = 'asp',
  ASPX = 'aspx',
  JSP = 'jsp',
  JSPX = 'jspx',
  CGI = 'cgi',
  PL = 'pl',
  PY = 'py',
  RB = 'rb',
}
