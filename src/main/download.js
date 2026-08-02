'use strict';

/**
 * Dateien aus dem Netz laden - z.B. direkt von einem GitHub-Release.
 *
 * Benutzt Electrons net-Modul (folgt Weiterleitungen, respektiert
 * System-Proxy und Zertifikate) und meldet den Fortschritt zurück.
 */

const { net } = require('electron');
const fs = require('fs');
const path = require('path');

class DownloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DownloadError';
  }
}

/** Nur echte Web-Links zulassen. */
function parseUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new DownloadError('Das ist keine gültige Adresse.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DownloadError('Nur http(s)-Links sind erlaubt.');
  }
  return url;
}

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** Dateinamen aus Content-Disposition oder der URL ableiten. */
function fileNameFrom(url, headers) {
  const disposition = headerValue(headers, 'content-disposition') || '';
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  let name = '';
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim());
    } catch {
      name = star[1].trim();
    }
  } else if (plain) {
    name = plain[1].trim();
  } else {
    name = decodeURIComponent(path.basename(url.pathname || ''));
  }

  // Nur den reinen Dateinamen behalten.
  name = name.replace(/[\\/]/g, '').replace(/[<>:"|?*\u0000-\u001f]/g, '').trim();
  return name || 'download.bin';
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Fragt Dateiname und Größe ab, ohne die Datei zu laden.
 * Manche Server mögen kein HEAD - dann wird ein GET mit Range 0-0 benutzt.
 */
function probe(rawUrl) {
  const url = parseUrl(rawUrl);

  return new Promise((resolve, reject) => {
    const request = net.request({ url: url.toString(), method: 'GET', redirect: 'follow' });
    request.setHeader('Range', 'bytes=0-0');
    request.setHeader('Accept', '*/*');

    request.on('response', (response) => {
      const status = response.statusCode;
      response.on('data', () => {});
      response.on('end', () => {});
      request.abort();

      if (status >= 400) {
        reject(new DownloadError(`Der Server antwortet mit Fehler ${status}.`));
        return;
      }

      // Bei Teil-Antworten steht die Gesamtgröße in Content-Range.
      const range = headerValue(response.headers, 'content-range') || '';
      const match = /\/(\d+)\s*$/.exec(range);
      const length = match
        ? Number(match[1])
        : Number(headerValue(response.headers, 'content-length') || 0);

      resolve({
        url: url.toString(),
        name: fileNameFrom(url, response.headers),
        bytes: Number.isFinite(length) ? length : 0,
        sizeText: length ? formatBytes(length) : 'unbekannt',
        type: headerValue(response.headers, 'content-type') || '',
        status,
      });
    });

    request.on('error', (err) => reject(new DownloadError(`Nicht erreichbar: ${err.message}`)));
    request.end();
  });
}

/**
 * Lädt eine Datei nach targetDir.
 *
 * @param {string} rawUrl
 * @param {string} targetDir
 * @param {{onProgress?: Function, register?: (cancel: Function) => void, freeSpace?: number}} options
 * @returns {Promise<{file: string, name: string, bytes: number}>}
 */
function download(rawUrl, targetDir, { onProgress = () => {}, register = () => {}, freeSpace } = {}) {
  const url = parseUrl(rawUrl);

  return new Promise((resolve, reject) => {
    fs.mkdirSync(targetDir, { recursive: true });

    const request = net.request({ url: url.toString(), method: 'GET', redirect: 'follow' });
    request.setHeader('Accept', '*/*');

    let canceled = false;
    let partPath = '';
    let stream = null;

    const cleanup = () => {
      try {
        stream?.destroy();
      } catch {
        /* egal */
      }
      if (partPath) fs.rmSync(partPath, { force: true });
    };

    const fail = (err) => {
      cleanup();
      reject(err instanceof DownloadError ? err : new DownloadError(err.message));
    };

    // Abbrechen von außen ermöglichen.
    register(() => {
      canceled = true;
      try {
        request.abort();
      } catch {
        /* egal */
      }
    });

    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        response.on('data', () => {});
        fail(new DownloadError(`Download fehlgeschlagen (Fehler ${response.statusCode}).`));
        return;
      }

      const name = fileNameFrom(url, response.headers);
      const total = Number(headerValue(response.headers, 'content-length') || 0);

      if (freeSpace !== undefined && total && total > freeSpace) {
        response.on('data', () => {});
        request.abort();
        fail(
          new DownloadError(
            `Zu wenig Speicherplatz: ${formatBytes(total)} nötig, frei sind ${formatBytes(freeSpace)}.`
          )
        );
        return;
      }

      const file = path.join(targetDir, name);
      partPath = `${file}.part`;
      stream = fs.createWriteStream(partPath);

      let received = 0;
      let lastReport = 0;
      const startedAt = Date.now();

      const report = (force = false) => {
        const now = Date.now();
        if (!force && now - lastReport < 150) return;
        lastReport = now;
        const seconds = Math.max((now - startedAt) / 1000, 0.001);
        const speed = received / seconds;
        onProgress({
          phase: 'download',
          received,
          total,
          percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0,
          receivedText: formatBytes(received),
          totalText: total ? formatBytes(total) : '?',
          speedText: `${formatBytes(speed)}/s`,
          etaSeconds: total && speed > 0 ? Math.round((total - received) / speed) : null,
          file: name,
        });
      };

      report(true);

      response.on('data', (chunk) => {
        if (canceled) return;
        received += chunk.length;
        if (!stream.write(chunk)) {
          response.pause?.();
          stream.once('drain', () => response.resume?.());
        }
        report();
      });

      response.on('error', (err) => fail(err));

      response.on('end', () => {
        if (canceled) {
          cleanup();
          reject(new DownloadError('Download abgebrochen.'));
          return;
        }
        stream.end(() => {
          try {
            if (total && received !== total) {
              throw new DownloadError('Die Datei kam unvollständig an.');
            }
            fs.renameSync(partPath, file);
            partPath = '';
            report(true);
            resolve({ file, name, bytes: received });
          } catch (err) {
            fail(err);
          }
        });
      });
    });

    request.on('error', (err) => {
      if (canceled) {
        cleanup();
        reject(new DownloadError('Download abgebrochen.'));
        return;
      }
      fail(new DownloadError(`Verbindung fehlgeschlagen: ${err.message}`));
    });

    request.on('abort', () => {
      if (canceled) {
        cleanup();
        reject(new DownloadError('Download abgebrochen.'));
      }
    });

    request.end();
  });
}

module.exports = { DownloadError, download, formatBytes, probe, parseUrl };
