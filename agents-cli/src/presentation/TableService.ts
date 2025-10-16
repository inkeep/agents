import Table from 'cli-table3';
import chalk from 'chalk';
import { OutputMode } from './OutputService';

/**
 * Table column definition
 */
export interface TableColumn {
  /**
   * Column header text
   */
  header: string;
  /**
   * Column alignment
   */
  align?: 'left' | 'center' | 'right';
  /**
   * Column width (number of characters)
   */
  width?: number;
}

/**
 * Table row data - array of cell values
 */
export type TableRow = string[];

/**
 * Service for creating and displaying formatted tables
 *
 * This service abstracts cli-table3 functionality and provides
 * a consistent interface for creating formatted tables in the CLI.
 */
export class TableService {
  constructor(private mode: OutputMode = OutputMode.NORMAL) {}

  /**
   * Set the output mode
   */
  setMode(mode: OutputMode): void {
    this.mode = mode;
  }

  /**
   * Create and display a table with the given columns and rows
   */
  display(columns: TableColumn[], rows: TableRow[]): void {
    if (this.mode === OutputMode.QUIET) return;

    if (this.mode === OutputMode.JSON) {
      // In JSON mode, output structured data
      const data = rows.map((row) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i].header] = row[i] || '';
        }
        return obj;
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Normal mode - display formatted table
    const table = new Table({
      head: columns.map((col) => chalk.cyan(col.header)),
      colAligns: columns.map((col) => col.align || 'left'),
      colWidths: columns.map((col) => col.width),
      style: {
        head: [],
        border: [],
      },
    });

    for (const row of rows) {
      table.push(row);
    }

    console.log(`\n${table.toString()}`);
  }

  /**
   * Create a simple table with headers and rows (convenience method)
   */
  simple(headers: string[], rows: TableRow[]): void {
    const columns: TableColumn[] = headers.map((header) => ({ header }));
    this.display(columns, rows);
  }

  /**
   * Create a two-column key-value table
   */
  keyValue(pairs: Record<string, string>): void {
    if (this.mode === OutputMode.QUIET) return;

    if (this.mode === OutputMode.JSON) {
      console.log(JSON.stringify(pairs, null, 2));
      return;
    }

    const table = new Table({
      style: {
        head: [],
        border: [],
      },
    });

    for (const [key, value] of Object.entries(pairs)) {
      table.push({ [chalk.cyan(key)]: value });
    }

    console.log(`\n${table.toString()}`);
  }
}

/**
 * Singleton instance for convenience
 */
export const tableService = new TableService();
