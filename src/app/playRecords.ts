import type {
  BoardId,
  DifficultyId,
  GameModeId,
  GameResult,
  GameSelection,
  MatchWinner,
} from './gameFlow';

export interface PlayRecord {
  readonly playerScore: number;
  readonly cpuScore: number;
  readonly selection: GameSelection;
  readonly winner: MatchWinner;
  readonly seed: number;
}

export type PlayRecordsLoadStatus = 'stored' | 'default' | 'recovered' | 'unavailable';

export interface PlayRecordsLoad {
  readonly records: readonly PlayRecord[];
  readonly status: PlayRecordsLoadStatus;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PLAY_RECORDS_STORAGE_KEY = 'hoketto.play-records.v1';
export const MAX_PLAY_RECORDS = 20;

const BOARD_IDS: readonly BoardId[] = ['straight-bench', 'twin-block', 'ricochet-lane'];
const DIFFICULTY_IDS: readonly DifficultyId[] = ['practice', 'normal'];
const GAME_MODE_IDS: readonly GameModeId[] = ['trial', 'match'];
const MATCH_WINNERS: readonly MatchWinner[] = ['PLAYER', 'CPU', 'DRAW'];

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isSafeScore(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 999;
}

function isSafeSeed(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isGameSelection(value: unknown): value is GameSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameSelection>;
  return (
    includesValue(BOARD_IDS, candidate.board) &&
    includesValue(DIFFICULTY_IDS, candidate.difficulty) &&
    includesValue(GAME_MODE_IDS, candidate.mode)
  );
}

function isPlayRecord(value: unknown): value is PlayRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlayRecord>;
  return (
    isSafeScore(candidate.playerScore) &&
    isSafeScore(candidate.cpuScore) &&
    isGameSelection(candidate.selection) &&
    includesValue(MATCH_WINNERS, candidate.winner) &&
    isSafeSeed(candidate.seed)
  );
}

function normalizeRecords(records: readonly PlayRecord[]): PlayRecord[] {
  return records.filter(isPlayRecord).slice(-MAX_PLAY_RECORDS);
}

export function loadPlayRecords(
  storage: StorageLike | null = getBrowserStorage(),
): PlayRecordsLoad {
  if (!storage) return { records: [], status: 'unavailable' };

  let raw: string | null;
  try {
    raw = storage.getItem(PLAY_RECORDS_STORAGE_KEY);
  } catch {
    return { records: [], status: 'unavailable' };
  }
  if (raw === null) return { records: [], status: 'default' };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { records: [], status: 'recovered' };
    const validRecords = parsed.filter(isPlayRecord);
    const wasTrimmed = parsed.length > MAX_PLAY_RECORDS;
    const wasRecovered = validRecords.length !== parsed.length || wasTrimmed;
    return {
      records: normalizeRecords(validRecords),
      status: wasRecovered ? 'recovered' : 'stored',
    };
  } catch {
    return { records: [], status: 'recovered' };
  }
}

export function appendPlayRecord(records: readonly PlayRecord[], result: GameResult): PlayRecord[] {
  return normalizeRecords([
    ...records,
    {
      playerScore: result.playerScore,
      cpuScore: result.cpuScore,
      selection: { ...result.selection },
      winner: result.winner,
      seed: result.seed,
    },
  ]);
}

export function savePlayRecords(
  records: readonly PlayRecord[],
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PLAY_RECORDS_STORAGE_KEY, JSON.stringify(normalizeRecords(records)));
    return true;
  } catch {
    return false;
  }
}

function winnerLabel(winner: MatchWinner): string {
  if (winner === 'PLAYER') return '自分の勝ち';
  if (winner === 'CPU') return '相手の勝ち';
  return '引き分け';
}

function boardLabel(board: BoardId): string {
  if (board === 'straight-bench') return 'ストレート・ベンチ';
  if (board === 'twin-block') return 'ツイン・ブロック';
  return 'リフレクト・レーン';
}

function difficultyLabel(difficulty: DifficultyId): string {
  return difficulty === 'practice' ? 'れんしゅう' : 'ふつう';
}

function modeLabel(mode: GameModeId): string {
  return mode === 'trial' ? '30秒の試し撃ち' : '90秒試合';
}

export function formatPlayRecordsForCopy(records: readonly PlayRecord[]): string {
  const normalized = normalizeRecords(records);
  if (normalized.length === 0) return 'ホケット 試遊記録\n記録はありません。';

  const lines = ['ホケット 試遊記録', `記録件数: ${normalized.length}`];
  normalized.forEach((record, index) => {
    lines.push(
      `${index + 1}. ${winnerLabel(record.winner)}　自分 ${record.playerScore} - 相手 ${record.cpuScore}　${boardLabel(record.selection.board)} / ${difficultyLabel(record.selection.difficulty)} / ${modeLabel(record.selection.mode)}`,
    );
  });
  return lines.join('\n');
}
