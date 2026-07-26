import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileType,
  File
} from 'lucide-react';

const EXT_MAP = {
  // images
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  webp: FileImage, svg: FileImage, bmp: FileImage, ico: FileImage,
  // video
  mp4: FileVideo, mov: FileVideo, avi: FileVideo, webm: FileVideo, mkv: FileVideo,
  // audio
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio, m4a: FileAudio,
  // archives
  zip: FileArchive, rar: FileArchive, tar: FileArchive, gz: FileArchive, '7z': FileArchive,
  // code
  js: FileCode2, jsx: FileCode2, ts: FileCode2, tsx: FileCode2, py: FileCode2,
  go: FileCode2, rs: FileCode2, c: FileCode2, cpp: FileCode2, java: FileCode2,
  html: FileCode2, css: FileCode2, json: FileCode2, xml: FileCode2, sh: FileCode2,
  // spreadsheet
  csv: FileSpreadsheet, xls: FileSpreadsheet, xlsx: FileSpreadsheet,
  // documents
  pdf: FileType, doc: FileType, docx: FileType, txt: FileText, md: FileText,
  ppt: FileType, pptx: FileType
};

export function getFileIcon(filename, mimeType) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (EXT_MAP[ext]) return EXT_MAP[ext];

  if (mimeType) {
    if (mimeType.startsWith('image/')) return FileImage;
    if (mimeType.startsWith('video/')) return FileVideo;
    if (mimeType.startsWith('audio/')) return FileAudio;
    if (mimeType.includes('zip') || mimeType.includes('compressed'))
      return FileArchive;
    if (mimeType.startsWith('text/')) return FileText;
  }

  return File;
}
