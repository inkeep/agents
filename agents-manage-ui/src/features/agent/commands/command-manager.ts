export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
}

class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private txBuffer: Command[] | null = null;

  execute(command: Command) {
    command.execute();
    if (this.txBuffer) {
      this.txBuffer.push(command);
    } else {
      this.undoStack.push(command);
      this.redoStack = [];
    }
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }

  beginTransaction() {
    if (!this.txBuffer) this.txBuffer = [];
  }

  commitTransaction(name = 'Batch') {
    if (!this.txBuffer || this.txBuffer.length === 0) {
      this.txBuffer = null;
      return;
    }
    const batch = this.txBuffer.slice();
    this.txBuffer = null;
    const composite: Command = {
      name,
      execute() {
        for (const c of batch) c.execute();
      },
      undo() {
        for (const c of [...batch].reverse()) c.undo();
      },
    };
    this.undoStack.push(composite);
    this.redoStack = [];
  }

  cancelTransaction() {
    if (!this.txBuffer) return;
    for (const c of [...this.txBuffer].reverse()) c.undo();
    this.txBuffer = null;
  }
}

export const commandManager = new CommandManager();
