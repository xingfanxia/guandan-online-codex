const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXY';
const DIGITS = '23456789';

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += LETTERS[Math.floor(random() * LETTERS.length)]!;
    code += DIGITS[Math.floor(random() * DIGITS.length)]!;
  }
  return code;
}
