// Distinct colors for calendar source layers
export const SOURCE_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#84CC16', // lime
  '#E11D48', // rose
];

export function getRandomColor(): string {
  return SOURCE_COLORS[Math.floor(Math.random() * SOURCE_COLORS.length)];
}
