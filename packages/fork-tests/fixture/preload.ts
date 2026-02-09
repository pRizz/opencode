if (process.env.OPENCODE_CONFIG_CONTENT === undefined) {
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    auth: {
      enabled: false,
    },
  })
}
