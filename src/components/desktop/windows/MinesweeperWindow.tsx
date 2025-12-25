'use client';

import { useState, useCallback, useEffect } from 'react';

type CellState = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
};

type GameState = 'playing' | 'won' | 'lost';

const ROWS = 9;
const COLS = 9;
const MINES = 10;

function createEmptyBoard(): CellState[][] {
  return Array(ROWS).fill(null).map(() =>
    Array(COLS).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  );
}

function placeMines(board: CellState[][], firstClickRow: number, firstClickCol: number): void {
  let minesPlaced = 0;
  while (minesPlaced < MINES) {
    const row = Math.floor(Math.random() * ROWS);
    const col = Math.floor(Math.random() * COLS);

    // Don't place mine on first click or adjacent cells
    const isNearFirstClick = Math.abs(row - firstClickRow) <= 1 && Math.abs(col - firstClickCol) <= 1;

    if (!board[row][col].isMine && !isNearFirstClick) {
      board[row][col].isMine = true;
      minesPlaced++;
    }
  }
}

function calculateAdjacentMines(board: CellState[][]): void {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col].isMine) continue;

      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const newRow = row + dr;
          const newCol = col + dc;
          if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
            if (board[newRow][newCol].isMine) count++;
          }
        }
      }
      board[row][col].adjacentMines = count;
    }
  }
}

function revealCell(board: CellState[][], row: number, col: number): void {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  if (board[row][col].isRevealed || board[row][col].isFlagged) return;

  board[row][col].isRevealed = true;

  if (board[row][col].adjacentMines === 0 && !board[row][col].isMine) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        revealCell(board, row + dr, col + dc);
      }
    }
  }
}

function checkWin(board: CellState[][]): boolean {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!board[row][col].isMine && !board[row][col].isRevealed) {
        return false;
      }
    }
  }
  return true;
}

const numberColors: Record<number, string> = {
  1: '#0000FF',
  2: '#008000',
  3: '#FF0000',
  4: '#000080',
  5: '#800000',
  6: '#008080',
  7: '#000000',
  8: '#808080',
};

export default function MinesweeperWindow() {
  const [board, setBoard] = useState<CellState[][]>(createEmptyBoard);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [isFirstClick, setIsFirstClick] = useState(true);
  const [flagCount, setFlagCount] = useState(0);
  const [time, setTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && gameState === 'playing') {
      interval = setInterval(() => {
        setTime(t => Math.min(t + 1, 999));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, gameState]);

  const resetGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setGameState('playing');
    setIsFirstClick(true);
    setFlagCount(0);
    setTime(0);
    setTimerActive(false);
  }, []);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (gameState !== 'playing') return;
    if (board[row][col].isFlagged || board[row][col].isRevealed) return;

    const newBoard = board.map(r => r.map(c => ({ ...c })));

    if (isFirstClick) {
      placeMines(newBoard, row, col);
      calculateAdjacentMines(newBoard);
      setIsFirstClick(false);
      setTimerActive(true);
    }

    if (newBoard[row][col].isMine) {
      // Game over - reveal all mines
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (newBoard[r][c].isMine) {
            newBoard[r][c].isRevealed = true;
          }
        }
      }
      setBoard(newBoard);
      setGameState('lost');
      setTimerActive(false);
      return;
    }

    revealCell(newBoard, row, col);
    setBoard(newBoard);

    if (checkWin(newBoard)) {
      setGameState('won');
      setTimerActive(false);
    }
  }, [board, gameState, isFirstClick]);

  const handleRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (gameState !== 'playing') return;
    if (board[row][col].isRevealed) return;

    const newBoard = board.map(r => r.map(c => ({ ...c })));
    newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
    setBoard(newBoard);
    setFlagCount(prev => newBoard[row][col].isFlagged ? prev + 1 : prev - 1);
  }, [board, gameState]);

  const renderCell = (cell: CellState, row: number, col: number) => {
    const baseStyle = "w-5 h-5 flex items-center justify-center text-xs font-bold select-none";

    if (!cell.isRevealed) {
      return (
        <button
          key={`${row}-${col}`}
          className={`${baseStyle} cursor-pointer`}
          style={{
            background: 'var(--button-face)',
            boxShadow: 'inset -1px -1px 0 var(--button-shadow), inset 1px 1px 0 var(--button-highlight), inset -2px -2px 0 var(--button-dark-shadow), inset 2px 2px 0 var(--button-face)',
          }}
          onClick={() => handleCellClick(row, col)}
          onContextMenu={(e) => handleRightClick(e, row, col)}
        >
          {cell.isFlagged ? '🚩' : ''}
        </button>
      );
    }

    if (cell.isMine) {
      return (
        <div
          key={`${row}-${col}`}
          className={`${baseStyle} bg-red-500`}
          style={{
            boxShadow: 'inset -1px -1px 0 var(--button-highlight), inset 1px 1px 0 var(--button-shadow)',
          }}
        >
          💣
        </div>
      );
    }

    return (
      <div
        key={`${row}-${col}`}
        className={baseStyle}
        style={{
          background: '#c0c0c0',
          boxShadow: 'inset -1px -1px 0 var(--button-highlight), inset 1px 1px 0 var(--button-shadow)',
          color: numberColors[cell.adjacentMines] || 'transparent',
        }}
      >
        {cell.adjacentMines > 0 ? cell.adjacentMines : ''}
      </div>
    );
  };

  const getFaceEmoji = () => {
    if (gameState === 'won') return '😎';
    if (gameState === 'lost') return '😵';
    return '🙂';
  };

  const formatNumber = (num: number) => {
    return num.toString().padStart(3, '0');
  };

  return (
    <div className="p-2 flex flex-col items-center gap-2 select-none">
      {/* Header */}
      <div
        className="flex items-center justify-between w-full px-2 py-1"
        style={{
          background: 'var(--button-face)',
          boxShadow: 'inset -1px -1px 0 var(--button-highlight), inset 1px 1px 0 var(--button-shadow), inset -2px -2px 0 var(--button-face), inset 2px 2px 0 var(--button-dark-shadow)',
        }}
      >
        {/* Mine Counter */}
        <div
          className="font-mono text-lg px-1"
          style={{
            background: '#000',
            color: '#f00',
            fontFamily: 'monospace',
          }}
        >
          {formatNumber(Math.max(0, MINES - flagCount))}
        </div>

        {/* Reset Button */}
        <button
          className="w-7 h-7 flex items-center justify-center text-lg cursor-pointer"
          style={{
            background: 'var(--button-face)',
            boxShadow: 'inset -1px -1px 0 var(--button-shadow), inset 1px 1px 0 var(--button-highlight), inset -2px -2px 0 var(--button-dark-shadow), inset 2px 2px 0 var(--button-face)',
          }}
          onClick={resetGame}
        >
          {getFaceEmoji()}
        </button>

        {/* Timer */}
        <div
          className="font-mono text-lg px-1"
          style={{
            background: '#000',
            color: '#f00',
            fontFamily: 'monospace',
          }}
        >
          {formatNumber(time)}
        </div>
      </div>

      {/* Game Board */}
      <div
        className="p-1"
        style={{
          background: 'var(--button-face)',
          boxShadow: 'inset -1px -1px 0 var(--button-highlight), inset 1px 1px 0 var(--button-shadow), inset -2px -2px 0 var(--button-face), inset 2px 2px 0 var(--button-dark-shadow)',
        }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, 20px)` }}>
          {board.map((row, rowIdx) =>
            row.map((cell, colIdx) => renderCell(cell, rowIdx, colIdx))
          )}
        </div>
      </div>

      {/* Status */}
      {gameState !== 'playing' && (
        <div className="text-center text-sm" style={{ color: 'var(--window-text)' }}>
          {gameState === 'won' ? '🎉 You Win!' : '💥 Game Over!'}
          <br />
          <span className="text-xs">Click the face to play again</span>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-center mt-1" style={{ color: 'var(--window-text)' }}>
        Left-click to reveal • Right-click to flag
      </div>
    </div>
  );
}
