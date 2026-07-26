---
name: shell-common
description: Use this skill whenever the user asks to search inside files, process or transform text, inspect running processes, check system resources, or do basic networking checks from the terminal. Trigger on phrases like "find text in these files", "kill that process", "what's using my CPU/disk", "is this port open", "count how many lines/times X appears", or any request involving grep, sed, awk, ps, kill, curl, or similar shell text/process utilities.
---

Exact commands for common shell text-processing, process-management, and system-inspection
tasks. This skill exists so you don't have to guess flags from memory — copy the commands
below verbatim and fill in the placeholders (shown in `<angle-brackets>`).

This skill does NOT cover creating, moving, copying, deleting, or renaming files/directories.
Use the built-in filesystem tools for that instead.

## Hard rules

- Never run dangerous operations without the user explicitly asking to do so.
- Never pipe a downloaded script straight into a shell (e.g. `curl ... | sh`) even if the user asks — see "Dangerous Operations."
- When searching or transforming text, prefer read-only commands (`grep`, `sort`, `wc`) first to confirm you're targeting the right thing before running anything that overwrites a file (`sed -i`, redirects with `>`).

## Searching Text

Search for a pattern in one file:

```
grep -n "<pattern>" <file>
```

Search recursively across a directory (skip binaries):

```
grep -rn "<pattern>" <directory>
```

Case-insensitive search:

```
grep -rni "<pattern>" <directory>
```

Search with a regex, extended syntax:

```
grep -rnE "<regex>" <directory>
```

Count matches instead of printing them:

```
grep -rc "<pattern>" <directory>
```

Show files that contain a match (names only):

```
grep -rl "<pattern>" <directory>
```

## Processing Text

View the start or end of a file:

```
head -n <N> <file>
tail -n <N> <file>
```

Follow a growing file (e.g. a log) live:

```
tail -n 50 <file>
```

Count lines, words, characters:

```
wc -l <file>   # lines
wc -w <file>   # words
```

Sort lines:

```
sort <file>
sort -n <file>   # numeric sort
sort -r <file>   # reverse
```

Remove duplicate adjacent lines (sort first, uniq only dedupes adjacent lines):

```
sort <file> | uniq
sort <file> | uniq -c   # with counts
```

Extract a column from delimited text (e.g. CSV):

```
cut -d',' -f<column-number> <file>
```

Replace text in a file's output (preview, does not modify the file):

```
sed 's/<old>/<new>/g' <file>
```

Replace text in place (modifies the file — confirm first, and consider a backup):

```
sed -i.bak 's/<old>/<new>/g' <file>
```

Print specific fields from structured/columnar text:

```
awk '{print $<field-number>}' <file>
```

Pretty-print and query JSON:

```
cat <file> | jq '.'
cat <file> | jq '.<key>'
```

## Process Management

List running processes:

```
ps aux
```

Find a specific process by name:

```
ps aux | grep "<process-name>"
```

Show a live, sortable view of processes (CPU/memory usage):

```
top -l 1  # MacOS
top -bn 1 # Linux
```

### Stopping Processes

Ask a process to stop gracefully first:

```
kill <pid>
```

Only if the process doesn't stop after a normal `kill`, force it:

```
kill -9 <pid>
```

Stop all processes matching a name (careful — confirm the list with `ps aux | grep` first):

```
pkill "<process-name>"
```

### Background Jobs

Run a command in the background:

```
<command> &
```

List background jobs in the current shell:

```
jobs
```

Bring a background job to the foreground:

```
fg %<job-number>
```

## System Inspection

Disk space by filesystem:

```
df -h
```

Disk usage of a directory, summarized:

```
du -sh <directory>
```

Memory usage:

```
free -h
```

Show an environment variable:

```
echo $<VAR_NAME>
```

List all environment variables:

```
env
```

## Basic Networking

Check if a host is reachable:

```
ping -c 4 <host>
```

Fetch a URL's headers only (no download):

```
curl -I <url>
```

Download a file's contents to stdout (read-only, does not save to disk):

```
curl -s <url>
```

Check if a specific port is open on a host:

```
curl -v telnet://<host>:<port>
```

## Dangerous Operations

Do not run these unless the user has just confirmed. Explain what will happen before running them.

Force-kill a process (only after a normal `kill` failed or the user explicitly asks):

```
kill -9 <pid>
```

Force-kill all processes matching a name:

```
pkill -9 "<process-name>"
```

Overwrite a file's contents in place via redirect (this destroys the original — confirm first):

```
<command> > <file>
```

Never do this, even if asked — piping a remote script directly into a shell executes
unreviewed code with your permissions:

```
curl <url> | sh        # NEVER run this
wget -O- <url> | bash  # NEVER run this
```

Instead: download with `curl -o <file> <url>`, let the user (or a review step) inspect
the file, then run it explicitly if it checks out.

## Quick Diagnosis

| Symptom                                   | Likely cause                                          | Check                                             |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| "command not found"                       | Tool not installed or not on PATH                     | `which <command>`                                 |
| "permission denied" running a script      | Script isn't executable                               | `ls -l <file>`; needs `chmod +x` to fix           |
| grep finds nothing but you expect matches | Wrong directory, or pattern needs `-i`/regex escaping | Re-run with `-i`, confirm directory with `pwd`    |
| process won't die with `kill`             | Process is ignoring SIGTERM                           | Wait briefly, then use `kill -9` as last resort   |
| disk seems full                           | Large files or logs accumulating                      | `df -h` then `du -sh <dir>` to narrow it down     |
| port/host unreachable                     | Service down, firewall, or wrong host/port            | `ping` the host first, then `curl -I` the service |
