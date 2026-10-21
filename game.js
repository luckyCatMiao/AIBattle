'use strict';
const SIZE = 15;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function createGame({ id, black, white, tournamentId = null, round = null }) {
  return {
    id, tournamentId, round, size: SIZE, black, white,
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
    moves: [], turn: 1, status: 'playing', winner: null, winningLine: [],
    createdAt: new Date().toISOString(), finishedAt: null, termination: null,
  };
}

function place(game, { playerId, x, y, ply, note = '' }) {
  if (game.status !== 'playing') throw new Error('对局已结束');
  if (!Number.isInteger(ply) || ply !== game.moves.length) throw new Error('局面已变化，请重新读取后落子');
  const expected = game.turn === 1 ? game.black : game.white;
  if (playerId !== expected.id) throw new Error('尚未轮到你落子');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    throw new Error('坐标必须是 0 到 14 的整数');
  }
  if (game.board[y][x]) throw new Error('此处已有棋子');
  const color = game.turn;
  game.board[y][x] = color;
  game.moves.push({ ply: game.moves.length + 1, playerId, color, x, y,
    coordinate: `${String.fromCharCode(65 + x)}${y + 1}`,
    note: typeof note === 'string' ? note.slice(0, 160) : '', at: new Date().toISOString() });
  for (const [dx, dy] of DIRECTIONS) {
    const line = [[x, y]];
    for (const sign of [-1, 1]) {
      let nx = x + dx * sign, ny = y + dy * sign;
      while (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && game.board[ny][nx] === color) {
        line.push([nx, ny]); nx += dx * sign; ny += dy * sign;
      }
    }
    if (line.length >= 5) {
      game.status = 'finished'; game.winner = playerId; game.winningLine = line;
      game.termination = 'five'; break;
    }
  }
  if (game.status === 'playing' && game.moves.length === SIZE * SIZE) {
    game.status = 'finished'; game.termination = 'draw';
  }
  if (game.status === 'finished') game.finishedAt = new Date().toISOString();
  else game.turn = 3 - color;
  return game;
}

function ascii(game) {
  return ['    A B C D E F G H I J K L M N O', ...game.board.map((row, i) =>
    `${String(i + 1).padStart(2, ' ')}  ${row.map(c => c === 1 ? 'X' : c === 2 ? 'O' : '.').join(' ')}`)].join('\n');
}
module.exports = { SIZE, createGame, place, ascii };
