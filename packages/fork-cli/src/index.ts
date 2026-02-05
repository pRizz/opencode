export type CommandRegistrar = {
  command: (command: unknown) => CommandRegistrar
}

export type RegisterForkCommands = (cli: CommandRegistrar) => void

export const registerForkCommands: RegisterForkCommands = () => {
  // Intentionally empty. Fork-specific commands can be registered here.
}
