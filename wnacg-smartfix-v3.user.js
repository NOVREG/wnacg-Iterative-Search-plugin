// ==UserScript==
// @name         WNACG 分页修复 - 智能c值获取
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  从安全边界417开始链式爬取，自动获取418+页码的c值
// @match        https://www.wnacg.com/search/index.php?*
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      www.wnacg.com
// ==/UserScript==

(function() {
    'use strict';

    // 安全边界：此页及之前不需要c参数
    const SMART_FIX_BOUNDARY = 417;

    const debug = (msg) => {
        console.log('[WNACG]', msg);
    };

    const extractMapping = (html, baseUrl) => {
        const mapping = {};
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('.f_left.paginator a[href*="p="]').forEach(a => {
            try {
                const u = new URL(a.href, baseUrl);
                const p = u.searchParams.get('p');
                const c = u.searchParams.get('c');
                if (p && c && c.includes('~') && !mapping[p]) {
                    mapping[p] = c;
                }
            } catch (e) {}
        });
        return mapping;
    };

    const saveMapping = (mapping) => {
        try {
            const existing = GM_getValue('paginationMap', {});
            const merged = { ...existing, ...mapping };
            GM_setValue('paginationMap', merged);
            return merged;
        } catch (e) {
            debug(`保存缓存失败: ${e.message}`);
            return null;
        }
    };

    const getMapping = () => {
        try {
            return GM_getValue('paginationMap', {});
        } catch (e) {
            return {};
        }
    };

    const fetchPage = async (url) => {
        try {
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            return await res.text();
        } catch (err) {
            debug(`请求失败: ${err.message}`);
            throw err;
        }
    };

    const getPageRange = (mapping) => {
        const pages = Object.keys(mapping).map(Number);
        if (pages.length === 0) return { min: 0, max: 0 };
        return {
            min: Math.min(...pages),
            max: Math.max(...pages)
        };
    };

    const crawlFromBoundary = async (targetP) => {
        debug(`=== 开始爬取，目标: p=${targetP} ===`);

        const overlay = document.createElement('div');
        overlay.id = 'wnacg-crawl-overlay';
        overlay.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: rgba(0,0,0,0.85); color: #fff;
            font-family: Arial, sans-serif; font-size: 13px;
            padding: 12px 16px; border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            min-width: 220px;
        `;
        overlay.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 6px; color: #ff0;">[WNACG] 正在获取 c 值</div>
            <div id="wnacg-crawl-status" style="color: #ccc;">准备中...</div>
            <div id="wnacg-crawl-progress" style="color: #888; font-size: 12px; margin-top: 4px;"></div>
        `;
        document.body.appendChild(overlay);

        const statusEl = document.getElementById('wnacg-crawl-status');
        const progressEl = document.getElementById('wnacg-crawl-progress');

        const updateOverlay = (status, progress) => {
            if (statusEl) statusEl.textContent = status;
            if (progressEl) progressEl.textContent = progress;
            debug(`${status} ${progress}`);
        };

        const removeOverlay = () => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };

        let currentP;
        const mapping = getMapping();
        const range = getPageRange(mapping);

        if (range.max > SMART_FIX_BOUNDARY) {
            currentP = range.max;
            updateOverlay(`从缓存继续`, `当前已到 p=${currentP}，目标 p=${targetP}`);
        } else {
            currentP = SMART_FIX_BOUNDARY;
            updateOverlay(`从安全边界开始`, `p=${currentP} → p=${targetP}`);
        }

        const maxAttempts = 500;
        let lastRangeMax = range.max;

        try {
            for (let i = 0; i < maxAttempts; i++) {
                const currentMapping = getMapping();
                const currentRange = getPageRange(currentMapping);

                if (currentMapping[targetP]) {
                    updateOverlay(`✅ 已找到`, `p=${targetP} 的 c 值`);
                    await new Promise(r => setTimeout(r, 500));
                    const u = new URL(window.location.href);
                    u.searchParams.set('c', currentMapping[targetP]);
                    window.location.replace(u.toString());
                    return;
                }

                updateOverlay(`正在爬取...`, `[${i+1}] 请求 p=${currentP}（缓存 ${currentRange.min}-${currentRange.max}）`);

                try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('p', currentP);

                    if (currentP > SMART_FIX_BOUNDARY) {
                        const cachedC = currentMapping[currentP];
                        if (cachedC) {
                            url.searchParams.set('c', cachedC);
                        } else {
                            updateOverlay(`回退中`, `p=${currentP} 缺少c，回退到${SMART_FIX_BOUNDARY}`);
                            currentP = SMART_FIX_BOUNDARY;
                            await new Promise(r => setTimeout(r, 300));
                            continue;
                        }
                    }

                    const html = await fetchPage(url.toString());
                    const newMapping = extractMapping(html, window.location.origin);

                    if (Object.keys(newMapping).length > 0) {
                        saveMapping(newMapping);
                        const newRange = getPageRange(newMapping);
                        updateOverlay(`已提取`, `+${Object.keys(newMapping).length} 条（${newRange.min}-${newRange.max}）`);

                        if (newMapping[targetP]) {
                            updateOverlay(`✅ 已找到`, `p=${targetP} 的 c 值`);
                            await new Promise(r => setTimeout(r, 500));
                            const u = new URL(window.location.href);
                            u.searchParams.set('c', newMapping[targetP]);
                            window.location.replace(u.toString());
                            return;
                        }

                        if (newRange.max <= lastRangeMax && i > 0) {
                            updateOverlay(`到达边界`, `范围未扩展，停止爬取`);
                            break;
                        }
                        lastRangeMax = newRange.max;
                        currentP = newRange.max;

                    } else {
                        updateOverlay(`无数据`, `p=${currentP} 未返回有效分页链接`);
                        if (currentP > SMART_FIX_BOUNDARY + 5) {
                            currentP = currentP - 5;
                        } else {
                            currentP = SMART_FIX_BOUNDARY;
                        }
                    }
                } catch (err) {
                    updateOverlay(`请求失败`, `p=${currentP}，准备重试`);
                    currentP = Math.max(SMART_FIX_BOUNDARY, currentP - 5);
                }

                await new Promise(r => setTimeout(r, 300));
            }

            updateOverlay(`❌ 失败`, `未找到 p=${targetP} 的 c 值`);
            await new Promise(r => setTimeout(r, 2000));
            alert(`[WNACG] 无法获取第 ${targetP} 页的 c 值。\n\n可能原因：\n1. 目标页超出搜索结果范围\n2. 网络请求被拦截\n3. 分页器结构发生变化`);
        } finally {
            removeOverlay();
        }
    };

    const fixCurrentPage = async () => {
        debug('=== 脚本启动 ===');

        const u = new URL(window.location.href);
        const p = parseInt(u.searchParams.get('p'), 10);

        debug(`当前URL: ${u.toString()}`);
        debug(`解析页码: p=${p}`);

        if (!p || isNaN(p)) {
            debug('没有有效p参数，退出');
            return;
        }

        if (p <= SMART_FIX_BOUNDARY) {
            debug(`p=${p} <= ${SMART_FIX_BOUNDARY}，安全页，不处理`);
            const mapping = extractMapping(document.documentElement.outerHTML, window.location.origin);
            if (Object.keys(mapping).length > 0) {
                saveMapping(mapping);
                debug(`缓存了 ${Object.keys(mapping).length} 条映射`);
            }
            return;
        }

        const c = u.searchParams.get('c');
        if (c && c.includes('~')) {
            debug(`已有c: ${c}`);
            const mapping = extractMapping(document.documentElement.outerHTML, window.location.origin);
            if (Object.keys(mapping).length > 0) {
                saveMapping(mapping);
            }
            return;
        }

        debug(`p=${p} > ${SMART_FIX_BOUNDARY} 且无c，开始处理`);
        await crawlFromBoundary(p);
    };

    // 页面加载后执行
    setTimeout(fixCurrentPage, 300);
})();
