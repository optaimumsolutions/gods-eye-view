import { normaliseContributors } from '../production/contributorsView.js';
import { normaliseBoard } from './model.js';

/**
 * The supply board's inputs (row 14 M2): the globe's own contributors files
 * for the built regions, read once, and the Oil Oracle store's
 * `/api/oracle/supply-board` route, re-read on every update and optional
 * (the hosted site proxies it to the console; development without a console
 * gets a 404 or 502 and the card says so). Portable: no Cesium, no DOM.
 */
export const ORACLE_SUPPLY_BOARD_URL = '/api/oracle/supply-board';

export function createSupplyBoardSource({
  regions,
  fetchImpl = (...args) => globalThis.fetch(...args),
  boardUrl = ORACLE_SUPPLY_BOARD_URL,
  now = () => Date.now(),
} = {}) {
  if (!Array.isArray(regions) || !regions.length)
    throw new TypeError('supply board requires its regions');
  let _regions = null;

  async function readJson(url, signal) {
    const response = await fetchImpl(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function readRegions(signal) {
    if (_regions) return _regions;
    const loaded = await Promise.all(
      regions.map(async (region) => {
        try {
          const contributors = normaliseContributors(
            await readJson(region.url, signal),
          );
          return contributors
            ? {
                ...contributors,
                label: region.label,
                // Layers of one region (the Permian's Texas three) fold into one line.
                ...(region.group ? { group: region.group } : {}),
              }
            : null;
        } catch (error) {
          if (signal?.aborted) throw error;
          return null;
        }
      }),
    );
    _regions = loaded.filter(Boolean);
    return _regions;
  }

  return {
    label: 'Oil Oracle store + filings',
    freshnessClass: 'published',
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const [regionList, board] = await Promise.all([
        readRegions(signal),
        readJson(boardUrl, signal).then(
          (payload) => ({ board: normaliseBoard(payload, { now: now() }) }),
          (error) => {
            if (signal?.aborted) throw error;
            return { board: null, boardError: error?.message ?? 'unavailable' };
          },
        ),
      ]);
      signal?.throwIfAborted();
      return Object.freeze({
        regions: regionList,
        board: board.board,
        boardError: board.board ? null : (board.boardError ?? 'stale or empty'),
        fetchedAt: now(),
      });
    },
  };
}
