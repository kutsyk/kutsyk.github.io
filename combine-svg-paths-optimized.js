#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { DOMParser } = require("@xmldom/xmldom");
const SvgPath = require("svgpath");

/* =========================================================
   Worker thread
========================================================= */

if (!isMainThread) {
    const { chunk, roundPrecision } = workerData;

    try {
        const results = new Array(chunk.length);

        for (let i = 0; i < chunk.length; i++) {
            const item = chunk[i];

            try {
                const transformedD = new SvgPath(item.d)
                    .matrix(item.matrix)
                    .abs()
                    .round(roundPrecision)
                    .toString();

                results[i] = {
                    index: item.index,
                    d: transformedD,
                };
            } catch (err) {
                results[i] = {
                    index: item.index,
                    error: err.message,
                };
            }
        }

        parentPort.postMessage({ ok: true, results });
    } catch (err) {
        parentPort.postMessage({
            ok: false,
            error: err.message,
        });
    }

    return;
}

/* =========================================================
   Main thread
========================================================= */

function usage() {
    console.error(`
Usage:
  node combine-svg-paths-optimized.js <input.svg> [options]

Options:
  --workers=N           Number of worker threads (default: sensible auto)
  --chunk-size=N        Paths per worker chunk (default: 500)
  --round=N             Decimal rounding precision (default: 6)
  --debug               Print extra memory/debug logs
`.trim());
    process.exit(1);
}

const inputFile = process.argv[2];
if (!inputFile || inputFile.startsWith("--")) usage();

const args = process.argv.slice(3);
const argMap = Object.fromEntries(
    args
        .filter((a) => a.startsWith("--"))
        .map((a) => {
            const stripped = a.replace(/^--/, "");
            if (!stripped.includes("=")) return [stripped, true];
            const [k, v] = stripped.split("=");
            return [k, v];
        })
);

const cpuCount = os.cpus().length;
const defaultWorkers = Math.max(1, Math.min(cpuCount - 1 || 1, 8));

const workerCount = clampInt(argMap.workers, defaultWorkers, 1, 32);
const chunkSize = clampInt(argMap["chunk-size"], 500, 50, 5000);
const roundPrecision = clampInt(argMap.round, 6, 0, 15);
const debug = Boolean(argMap.debug);

if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
}

/* =========================================================
   Helpers
========================================================= */

function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function bytesToMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
}

function formatNumber(n) {
    return new Intl.NumberFormat("en-US").format(n);
}

function logMemory(label) {
    const m = process.memoryUsage();
    console.log(
        `${label} | rss=${bytesToMB(m.rss)} MB, heapUsed=${bytesToMB(m.heapUsed)} MB, heapTotal=${bytesToMB(m.heapTotal)} MB`
    );
}

function createSpinner(label) {
    const frames = ["|", "/", "-", "\\"];
    let index = 0;
    let timer = null;
    let suffix = "";

    function render() {
        process.stdout.write(`\r${frames[index++ % frames.length]} ${label}${suffix}`);
    }

    return {
        start() {
            if (timer) return;
            render();
            timer = setInterval(render, 100);
        },
        update(text) {
            suffix = text ? ` ${text}` : "";
        },
        stop(finalMessage = "") {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            process.stdout.write("\r");
            if (typeof process.stdout.clearLine === "function") {
                process.stdout.clearLine(0);
            }

            if (finalMessage) {
                console.log(finalMessage);
            }
        },
    };
}

function yieldToEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
}

function identityMatrix() {
    return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrices(m1, m2) {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;

    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ];
}

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}

function parseNumbers(str) {
    return (str.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number);
}

function transformToMatrix(transformStr) {
    if (!transformStr || !transformStr.trim()) {
        return identityMatrix();
    }

    let result = identityMatrix();
    const regex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    let match;

    while ((match = regex.exec(transformStr)) !== null) {
        const fn = match[1];
        const args = parseNumbers(match[2]);
        let m = identityMatrix();

        switch (fn) {
            case "matrix":
                if (args.length !== 6) {
                    throw new Error(`Invalid matrix() transform: ${transformStr}`);
                }
                m = args;
                break;

            case "translate": {
                const [tx = 0, ty = 0] = args;
                m = [1, 0, 0, 1, tx, ty];
                break;
            }

            case "scale": {
                const [sx = 1, sy = sx] = args;
                m = [sx, 0, 0, sy, 0, 0];
                break;
            }

            case "rotate": {
                const [angle = 0, cx = 0, cy = 0] = args;
                const rad = degToRad(angle);
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);

                if (args.length > 1) {
                    const t1 = [1, 0, 0, 1, cx, cy];
                    const r = [cos, sin, -sin, cos, 0, 0];
                    const t2 = [1, 0, 0, 1, -cx, -cy];
                    m = multiplyMatrices(multiplyMatrices(t1, r), t2);
                } else {
                    m = [cos, sin, -sin, cos, 0, 0];
                }
                break;
            }

            case "skewX": {
                const [angle = 0] = args;
                m = [1, 0, Math.tan(degToRad(angle)), 1, 0, 0];
                break;
            }

            case "skewY": {
                const [angle = 0] = args;
                m = [1, Math.tan(degToRad(angle)), 0, 1, 0, 0];
                break;
            }

            default:
                throw new Error(`Unsupported transform function: ${fn}`);
        }

        result = multiplyMatrices(result, m);
    }

    return result;
}

function getNodeTransform(node) {
    if (!node || !node.getAttribute) return identityMatrix();
    return transformToMatrix(node.getAttribute("transform") || "");
}

function getCumulativeTransform(pathNode) {
    let current = pathNode;
    const chain = [];

    while (current && current.nodeType === 1) {
        chain.push(getNodeTransform(current));
        current = current.parentNode;
        if (current && current.nodeType === 9) break;
    }

    let result = identityMatrix();
    for (let i = chain.length - 1; i >= 0; i--) {
        result = multiplyMatrices(result, chain[i]);
    }

    return result;
}

function walk(node, cb) {
    cb(node);
    for (let child = node.firstChild; child; child = child.nextSibling) {
        walk(child, cb);
    }
}

function collectSvgData(svg) {
    const stats = {
        totalElements: 0,
        pathCount: 0,
        pathWithDCount: 0,
        groupCount: 0,
        rectCount: 0,
        circleCount: 0,
        ellipseCount: 0,
        polygonCount: 0,
        polylineCount: 0,
        lineCount: 0,
        textCount: 0,
        transformedElementCount: 0,
    };

    const pathNodes = [];

    walk(svg, (node) => {
        if (node.nodeType !== 1) return;

        stats.totalElements++;
        const name = node.nodeName;

        switch (name) {
            case "path":
                stats.pathCount++;
                if ((node.getAttribute("d") || "").trim()) {
                    stats.pathWithDCount++;
                    pathNodes.push(node);
                }
                break;
            case "g":
                stats.groupCount++;
                break;
            case "rect":
                stats.rectCount++;
                break;
            case "circle":
                stats.circleCount++;
                break;
            case "ellipse":
                stats.ellipseCount++;
                break;
            case "polygon":
                stats.polygonCount++;
                break;
            case "polyline":
                stats.polylineCount++;
                break;
            case "line":
                stats.lineCount++;
                break;
            case "text":
                stats.textCount++;
                break;
        }

        if ((node.getAttribute("transform") || "").trim()) {
            stats.transformedElementCount++;
        }
    });

    return { stats, pathNodes };
}

function splitIntoChunks(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function runWorker(chunk, roundPrecision) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
            workerData: {
                chunk,
                roundPrecision,
            },
        });

        let settled = false;

        worker.once("message", (msg) => {
            settled = true;
            if (!msg || !msg.ok) {
                reject(new Error(msg?.error || "Worker failed"));
                return;
            }
            resolve(msg.results);
        });

        worker.once("error", (err) => {
            settled = true;
            reject(err);
        });

        worker.once("exit", (code) => {
            if (!settled && code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

async function processInParallel(items, workers, chunkSize, roundPrecision, spinner) {
    const chunks = splitIntoChunks(items, chunkSize);
    const totalChunks = chunks.length;
    const totalItems = items.length;
    const results = new Array(totalItems);

    let nextChunkIndex = 0;
    let completedChunks = 0;
    let completedItems = 0;
    let errorCount = 0;

    async function workerLoop() {
        while (true) {
            const currentChunkIndex = nextChunkIndex++;
            if (currentChunkIndex >= totalChunks) return;

            const chunk = chunks[currentChunkIndex];
            const chunkResult = await runWorker(chunk, roundPrecision);

            for (const item of chunkResult) {
                if (item.error) {
                    errorCount++;
                    continue;
                }
                results[item.index] = item.d;
                completedItems++;
            }

            completedChunks++;
            spinner.update(
                `[chunks ${formatNumber(completedChunks)}/${formatNumber(totalChunks)}]` +
                ` [paths ${formatNumber(completedItems)}/${formatNumber(totalItems)}]` +
                ` [errors ${formatNumber(errorCount)}]`
            );
        }
    }

    const actualWorkers = Math.min(workers, Math.max(1, totalChunks));
    const pool = [];
    for (let i = 0; i < actualWorkers; i++) {
        pool.push(workerLoop());
    }

    await Promise.all(pool);

    return {
        results,
        errorCount,
        completedItems,
        totalChunks,
    };
}

function escapeXmlAttr(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function buildSvgOpenTag(svgNode) {
    const attrs = [];
    if (svgNode.attributes) {
        for (let i = 0; i < svgNode.attributes.length; i++) {
            const attr = svgNode.attributes.item(i);
            attrs.push(`${attr.name}="${escapeXmlAttr(attr.value)}"`);
        }
    }
    return `<svg ${attrs.join(" ")}>`;
}

function buildPathOpenTag(pathNode) {
    const attrs = [];
    if (pathNode.attributes) {
        for (let i = 0; i < pathNode.attributes.length; i++) {
            const attr = pathNode.attributes.item(i);
            if (attr.name === "d" || attr.name === "transform") continue;
            attrs.push(`${attr.name}="${escapeXmlAttr(attr.value)}"`);
        }
    }

    if (attrs.length === 0) {
        return `<path d="`;
    }

    return `<path ${attrs.join(" ")} d="`;
}

async function writeText(stream, text) {
    return new Promise((resolve, reject) => {
        const ok = stream.write(text, "utf8");
        if (ok) {
            resolve();
        } else {
            stream.once("drain", resolve);
            stream.once("error", reject);
        }
    });
}

async function writeCombinedSvgStream({
                                          outputFile,
                                          svgNode,
                                          firstPathNode,
                                          validDs,
                                          debug,
                                      }) {
    const spinner = createSpinner("Writing combined SVG");
    spinner.start();

    const stream = fs.createWriteStream(outputFile, { encoding: "utf8" });
    const total = validDs.length;

    return new Promise(async (resolve, reject) => {
        let finished = false;

        function fail(err) {
            if (finished) return;
            finished = true;
            spinner.stop();
            stream.destroy();
            reject(err);
        }

        stream.on("error", fail);

        try {
            await writeText(stream, `<?xml version="1.0" encoding="UTF-8"?>\n`);
            await writeText(stream, buildSvgOpenTag(svgNode));
            await writeText(stream, `\n  `);
            await writeText(stream, buildPathOpenTag(firstPathNode));

            for (let i = 0; i < validDs.length; i++) {
                if (i > 0) {
                    await writeText(stream, " ");
                }

                await writeText(stream, validDs[i]);

                if ((i + 1) % 1000 === 0 || i === total - 1) {
                    spinner.update(`[paths written ${formatNumber(i + 1)}/${formatNumber(total)}]`);

                    if (debug && (i + 1) % 10000 === 0) {
                        spinner.stop();
                        logMemory(`Write progress ${formatNumber(i + 1)}/${formatNumber(total)}`);
                        spinner.start();
                        spinner.update(`[paths written ${formatNumber(i + 1)}/${formatNumber(total)}]`);
                    }

                    await yieldToEventLoop();
                }
            }

            await writeText(stream, `" />\n</svg>\n`);

            stream.end(() => {
                if (finished) return;
                finished = true;
                spinner.stop(`Saved: ${outputFile}`);
                resolve();
            });
        } catch (err) {
            fail(err);
        }
    });
}

/* =========================================================
   Main
========================================================= */

(async function main() {
    try {
        const startupSpinner = createSpinner("Reading input");
        startupSpinner.start();

        const fileBuffer = fs.readFileSync(inputFile);
        const svgText = fileBuffer.toString("utf8");

        startupSpinner.update("[parsing SVG]");
        const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const svg = doc.documentElement;

        if (!svg || svg.nodeName !== "svg") {
            throw new Error("Input file is not a valid SVG.");
        }

        startupSpinner.update("[collecting stats]");
        const { stats, pathNodes } = collectSvgData(svg);
        startupSpinner.stop();

        console.log("SVG stats:");
        console.log(`  File: ${path.basename(inputFile)}`);
        console.log(`  Size: ${bytesToMB(fileBuffer.length)} MB`);
        console.log(`  Total elements: ${formatNumber(stats.totalElements)}`);
        console.log(`  Paths: ${formatNumber(stats.pathCount)}`);
        console.log(`  Paths with valid d: ${formatNumber(stats.pathWithDCount)}`);
        console.log(`  Groups: ${formatNumber(stats.groupCount)}`);
        console.log(`  Transformed elements: ${formatNumber(stats.transformedElementCount)}`);
        console.log(`  Rects: ${formatNumber(stats.rectCount)}`);
        console.log(`  Circles: ${formatNumber(stats.circleCount)}`);
        console.log(`  Ellipses: ${formatNumber(stats.ellipseCount)}`);
        console.log(`  Polygons: ${formatNumber(stats.polygonCount)}`);
        console.log(`  Polylines: ${formatNumber(stats.polylineCount)}`);
        console.log(`  Lines: ${formatNumber(stats.lineCount)}`);
        console.log(`  Text nodes: ${formatNumber(stats.textCount)}`);
        console.log(`  Workers: ${formatNumber(workerCount)}`);
        console.log(`  Chunk size: ${formatNumber(chunkSize)}`);
        console.log(`  Round precision: ${formatNumber(roundPrecision)}`);

        if (debug) {
            logMemory("After parse/stats");
        }

        if (pathNodes.length === 0) {
            console.error("No <path> elements with valid d attributes were found.");
            process.exit(1);
        }

        const prepSpinner = createSpinner("Preparing path jobs");
        prepSpinner.start();

        const jobs = new Array(pathNodes.length);

        for (let i = 0; i < pathNodes.length; i++) {
            const node = pathNodes[i];

            jobs[i] = {
                index: i,
                d: node.getAttribute("d"),
                matrix: getCumulativeTransform(node),
            };

            if ((i + 1) % 1000 === 0 || i === pathNodes.length - 1) {
                prepSpinner.update(`[${formatNumber(i + 1)}/${formatNumber(pathNodes.length)}]`);
                if ((i + 1) % 5000 === 0) {
                    await yieldToEventLoop();
                }
            }
        }

        prepSpinner.stop("Prepared path jobs.");

        if (debug) {
            logMemory("After job preparation");
        }

        const combineSpinner = createSpinner("Combining paths");
        combineSpinner.start();

        const { results, errorCount, completedItems } = await processInParallel(
            jobs,
            workerCount,
            chunkSize,
            roundPrecision,
            combineSpinner
        );

        combineSpinner.stop(
            `Processed ${formatNumber(completedItems)}/${formatNumber(jobs.length)} paths. Errors: ${formatNumber(errorCount)}.`
        );

        if (debug) {
            logMemory("After worker combine");
        }

        const filterSpinner = createSpinner("Collecting combined path segments");
        filterSpinner.start();

        const validDs = [];
        for (let i = 0; i < results.length; i++) {
            if (results[i]) {
                validDs.push(results[i]);
            }

            if ((i + 1) % 5000 === 0 || i === results.length - 1) {
                filterSpinner.update(`[${formatNumber(i + 1)}/${formatNumber(results.length)}]`);
                await yieldToEventLoop();
            }
        }

        filterSpinner.stop(
            `Collected ${formatNumber(validDs.length)} valid transformed paths.`
        );

        if (validDs.length === 0) {
            throw new Error("No valid transformed paths were produced.");
        }

        if (debug) {
            logMemory("After collecting valid path strings");
        }

        const parsed = path.parse(inputFile);
        const outputFile = path.join(parsed.dir, `${parsed.name}-combined.svg`);

        await writeCombinedSvgStream({
            outputFile,
            svgNode: svg,
            firstPathNode: pathNodes[0],
            validDs,
            debug,
        });

        console.log("Summary:");
        console.log(`  Input paths combined: ${formatNumber(validDs.length)}`);
        console.log(`  Final path count: 1`);
        console.log(`  Failed path transforms: ${formatNumber(errorCount)}`);

        if (debug) {
            logMemory("Finished");
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
})();