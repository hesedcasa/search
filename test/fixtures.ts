/**
 * A slice of the real sdkck host command surface, shaped the way the `search`
 * command consumes it (`this.config.commands`).
 *
 * Every id, description, argument and flag below is copied from the shipping
 * plugins — the sibling `@hesed/*` repos and the `@oclif/*` plugins sdkck
 * bundles — so matching behavior is tested against the shapes production
 * actually serves. When a plugin renames or restructures a command, this
 * catalog is what needs updating; that friction is deliberate, so a stale
 * fixture cannot quietly drift away from the surface users have.
 *
 * Descriptions keep oclif's `<%= config.bin %>` templates unrendered, matching
 * what a Loadable command carries before display-time interpolation.
 */
export type FixtureArg = {
  description: string
  hidden?: boolean
  name: string
  required: boolean
  type: string
}

export type FixtureFlag = {
  description: string
  hidden?: boolean
  name: string
  required: boolean
  type: 'boolean' | 'option'
}

export type FixtureCommand = {
  args?: Record<string, FixtureArg>
  description?: string
  flags?: Record<string, FixtureFlag>
  hidden?: boolean
  id: string
  pluginName: string
  summary?: string
}

export const HOST_COMMANDS: FixtureCommand[] = [
  {
    description: 'Display help for <%= config.bin %>.',
    id: 'help',
    pluginName: '@oclif/plugin-help',
  },
  {
    args: {query: {description: 'Search term to filter commands by', name: 'query', required: true, type: 'string'}},
    description: 'Search for available commands',
    // This plugin's own command, as the host loads it: `enableJsonFlag`
    // contributes the `json` flag, `limit` is an oclif option flag.
    flags: {
      details: {
        description: 'Show full help for each matched command',
        name: 'details',
        required: false,
        type: 'boolean',
      },
      json: {description: 'Format output as json.', name: 'json', required: false, type: 'boolean'},
      limit: {description: 'Maximum number of results to return', name: 'limit', required: false, type: 'option'},
    },
    id: 'search',
    pluginName: '@hesed/search',
  },
  {
    description: 'List installed plugins.',
    id: 'plugins',
    pluginName: '@oclif/plugin-plugins',
  },
  {
    description: 'Installs a plugin into <%= config.bin %>.',
    id: 'plugins install',
    pluginName: '@oclif/plugin-plugins',
  },
  {
    description: 'Removes a plugin from the CLI.',
    id: 'plugins uninstall',
    pluginName: '@oclif/plugin-plugins',
  },
  {
    description: 'Add Jira authentication',
    id: 'jira auth add',
    pluginName: '@hesed/jira',
  },
  {
    args: {issueId: {description: 'Issue ID or issue key', name: 'issueId', required: true, type: 'string'}},
    description: 'Get details of a specific issue',
    id: 'jira issue',
    pluginName: '@hesed/jira',
  },
  {
    description: 'Create a new issue',
    id: 'jira issue create',
    pluginName: '@hesed/jira',
  },
  {
    description: 'Searches for issues using JQL',
    id: 'jira issue search',
    pluginName: '@hesed/jira',
  },
  {
    description: 'Create a new pull request',
    id: 'bb pr create',
    pluginName: '@hesed/bb',
  },
  {
    description: 'Update a pull request',
    id: 'bb pr update',
    pluginName: '@hesed/bb',
  },
  {
    description:
      'Import an OpenAPI spec, Postman collection, or GraphQL schema (SDL/introspection/endpoint) and register its operations as commands',
    id: 'api import',
    pluginName: '@hesed/api2cli',
  },
]

/**
 * Looks up one catalog entry by id, failing the test run when the catalog no
 * longer contains it — call sites depend on the entry's shape, not just its
 * existence.
 *
 * @param id The command id, e.g. 'jira issue create'.
 * @returns The matching catalog entry.
 */
export function fixtureCommand(id: string): FixtureCommand {
  const command = HOST_COMMANDS.find((command) => command.id === id)
  if (!command) {
    throw new Error(`fixture command not found: ${id} — update test/fixtures.ts to match the real surface`)
  }

  return command
}
