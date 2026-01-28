/**
 * Box utility for creating terminal boxes
 * Creates high-contrast, professional-looking boxes using chalk
 */

let chalk: any;
try {
  chalk = require('chalk');
} catch {
  chalk = {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    cyan: (str: string) => str,
    white: (str: string) => str,
    bold: (str: string) => str,
    dim: (str: string) => str,
  };
}

export interface BoxOptions {
  title?: string;
  padding?: number;
  borderColor?: 'green' | 'yellow' | 'red' | 'cyan' | 'white';
  titleColor?: 'green' | 'yellow' | 'red' | 'cyan' | 'white';
  align?: 'left' | 'center';
}

/**
 * Create a boxed message for terminal output
 */
export function createBox(content: string, options: BoxOptions = {}): string {
  const {
    title,
    padding = 1,
    borderColor = 'cyan',
    titleColor = 'white',
    align = 'left',
  } = options;

  const borderChar = borderColor === 'green' ? chalk.green('─') :
                     borderColor === 'yellow' ? chalk.yellow('─') :
                     borderColor === 'red' ? chalk.red('─') :
                     borderColor === 'cyan' ? chalk.cyan('─') :
                     chalk.white('─');
  
  const cornerTL = borderColor === 'green' ? chalk.green('┌') :
                   borderColor === 'yellow' ? chalk.yellow('┌') :
                   borderColor === 'red' ? chalk.red('┌') :
                   borderColor === 'cyan' ? chalk.cyan('┌') :
                   chalk.white('┌');
  
  const cornerTR = borderColor === 'green' ? chalk.green('┐') :
                   borderColor === 'yellow' ? chalk.yellow('┐') :
                   borderColor === 'red' ? chalk.red('┐') :
                   borderColor === 'cyan' ? chalk.cyan('┐') :
                   chalk.white('┐');
  
  const cornerBL = borderColor === 'green' ? chalk.green('└') :
                   borderColor === 'yellow' ? chalk.yellow('└') :
                   borderColor === 'red' ? chalk.red('└') :
                   borderColor === 'cyan' ? chalk.cyan('└') :
                   chalk.white('└');
  
  const cornerBR = borderColor === 'green' ? chalk.green('┘') :
                   borderColor === 'yellow' ? chalk.yellow('┘') :
                   borderColor === 'red' ? chalk.red('┘') :
                   borderColor === 'cyan' ? chalk.cyan('┘') :
                   chalk.white('┘');
  
  const vertical = borderColor === 'green' ? chalk.green('│') :
                   borderColor === 'yellow' ? chalk.yellow('│') :
                   borderColor === 'red' ? chalk.red('│') :
                   borderColor === 'cyan' ? chalk.cyan('│') :
                   chalk.white('│');

  const titleColorFn = titleColor === 'green' ? chalk.green :
                       titleColor === 'yellow' ? chalk.yellow :
                       titleColor === 'red' ? chalk.red :
                       titleColor === 'cyan' ? chalk.cyan :
                       chalk.white;

  const lines = content.split('\n');
  const maxWidth = Math.max(
    ...lines.map(line => line.length),
    title ? title.length + 2 : 0
  );

  let result = '';

  // Top border
  result += cornerTL + borderChar.repeat(maxWidth + padding * 2) + cornerTR + '\n';

  // Title (if provided)
  if (title) {
    const titleText = titleColorFn(chalk.bold(title));
    const titlePadding = ' '.repeat(padding);
    result += vertical + titlePadding + titleText + ' '.repeat(maxWidth - title.length + padding) + vertical + '\n';
    result += vertical + ' '.repeat(maxWidth + padding * 2) + vertical + '\n';
  }

  // Content lines
  for (const line of lines) {
    const linePadding = ' '.repeat(padding);
    const contentPadding = ' '.repeat(maxWidth - line.length);
    result += vertical + linePadding + line + contentPadding + linePadding + vertical + '\n';
  }

  // Bottom border
  result += cornerBL + borderChar.repeat(maxWidth + padding * 2) + cornerBR;

  return result;
}

