export function buildCoordinatePrompt(instruction: string): string {
  return `You locate click targets on screen.

# Task
${instruction}

# Rules
- Output "x,y" only if exactly one unambiguous target is visible
- Output "None" otherwise

# Format
"x,y" or "None" only.`;
}

