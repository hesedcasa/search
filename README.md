# search

Intelligence search plugin

[![Version](https://img.shields.io/npm/v/@hesed/search.svg)](https://npmjs.org/package/@hesed/search)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/hesedcasa/@hesed/search/blob/main/LICENSE)
[![Downloads/week](https://img.shields.io/npm/dw/@hesed/search.svg)](https://npmjs.org/package/@hesed/search)

<!-- toc -->
* [search](#search)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @hesed/search
$ search COMMAND
running command...
$ search (--version)
@hesed/search/0.2.1 linux-x64 node-v22.22.3
$ search --help [COMMAND]
USAGE
  $ search COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`search search QUERY`](#search-search-query)

## `search search QUERY`

Search for available commands

```
USAGE
  $ search search QUERY [--json] [-d] [-n <value>]

ARGUMENTS
  QUERY  Search term to filter commands by

FLAGS
  -d, --details        Show full help for each matched command
  -n, --limit=<value>  [default: 5] Maximum number of results to return

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Search for available commands

EXAMPLES
  $ search search "create pr"

  $ search search jira -d

  $ search search "update jira" --details
```

_See code: [src/commands/search.ts](https://github.com/hesedcasa/search/blob/v0.2.1/src/commands/search.ts)_
<!-- commandsstop -->
