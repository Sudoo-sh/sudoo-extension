/**
 * A small, dependency-free ZIP writer (deflate, fixed timestamps) so the store package is the same bytes for the
 * same sources: anyone can rebuild it and compare.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

// 2026-01-01 00:00 in DOS time
/** DOS time field written for every entry: midnight. Fixed so the same sources give the same bytes. */
const DOS_TIME = 0;
/** DOS date field written for every entry: 1 January 2026. Fixed for the same reason as DOS_TIME. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Lists every file below a folder, sorted by name, so the package order is stable. Source maps are left out. */
function files(dir) {
  const list = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) list.push(...files(path));
    else if (!name.endsWith(".map")) list.push(path);
  }
  return list;
}

/**
 * Writes a ZIP file of a folder: each file is deflated (or stored when deflating does not make it smaller), with names
 * in UTF-8, fixed timestamps and permissions rw-r--r--.
 * Takes `dir`, the folder to pack, and `target`, the ZIP file to write. Overwrites `target` if it exists.
 *
 * @param {string} dir - The folder to pack; its files are added in sorted order so the ZIP is reproducible.
 * @param {string} target - The ZIP file to write.
 * @returns {void}
 * @throws When a file cannot be read or the target cannot be written (the error from `node:fs`).
 */
export function zipDirectory(dir, target) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const path of files(dir)) {
    const name = Buffer.from(relative(dir, path).split(sep).join("/"));
    const data = readFileSync(path);
    const packed = deflateRawSync(data, { level: 9 });
    const store = packed.length >= data.length;
    const body = store ? data : packed;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // made by Unix, 3.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(target, Buffer.concat([...locals, directory, end]));
}
