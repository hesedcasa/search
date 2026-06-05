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
@hesed/search/0.2.2 linux-x64 node-v22.22.3
$ search --help [COMMAND]
USAGE
  $ search COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`search search QUERY`](#search-search-query)
* [`search synonyms export [FILE]`](#search-synonyms-export-file)
* [`search synonyms import FILE`](#search-synonyms-import-file)

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

_See code: [src/commands/search.ts](https://github.com/hesedcasa/search/blob/v0.2.2/src/commands/search.ts)_

## `search synonyms export [FILE]`

Export the stored synonyms to a JSON file or stdout

```
USAGE
  $ search synonyms export [FILE]

ARGUMENTS
  [FILE]  Output file path (prints to stdout if omitted)

DESCRIPTION
  Export the stored synonyms to a JSON file or stdout

EXAMPLES
  $ search synonyms export

  $ search synonyms export ./my-synonyms.json
```

_See code: [src/commands/synonyms/export.ts](https://github.com/hesedcasa/search/blob/v0.2.2/src/commands/synonyms/export.ts)_

## `search synonyms import FILE`

Import synonyms from a JSON file

```
USAGE
  $ search synonyms import FILE [--merge]

ARGUMENTS
  FILE  Path to a JSON synonyms file to import

FLAGS
  --merge  Merge with existing synonyms instead of replacing them

DESCRIPTION
  Import synonyms from a JSON file

EXAMPLES
  $ search synonyms import ./synonyms.json

  $ search synonyms import ./synonyms.json --merge
```

_See code: [src/commands/synonyms/import.ts](https://github.com/hesedcasa/search/blob/v0.2.2/src/commands/synonyms/import.ts)_
<!-- commandsstop -->
