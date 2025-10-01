#!/usr/bin/expect -f

# Usage: ./scripts/quick-changeset.sh <patch|minor|major> "changelog message"

set bump_type [lindex $argv 0]
set message [lindex $argv 1]

if {$bump_type eq "" || $message eq ""} {
    puts "Usage: $argv0 <patch|minor|major> \"changelog message\""
    exit 1
}

if {$bump_type ne "patch" && $bump_type ne "minor" && $bump_type ne "major"} {
    puts "Error: Bump type must be 'patch', 'minor', or 'major'"
    exit 1
}

# Reduce timeout and disable delay
set timeout 3
set send_slow {1 .001}

# Spawn the changeset command
spawn pnpm changeset

# Wait for package selection prompt and select all (match partial string)
expect -re "Which packages.*include"
sleep 0.1
send " \r"

# Handle major bump selection
expect -re "major bump"
sleep 0.1
if {$bump_type eq "major"} {
    send " \r"
} else {
    send "\r"
}

# Handle minor bump selection
expect -re "minor bump"
sleep 0.1
if {$bump_type eq "minor"} {
    send " \r"
} else {
    send "\r"
}

# Enter the summary message
expect -re "summary"
sleep 0.1
send "$message\r"

# Confirm the changeset
expect -re "desired changeset"
sleep 0.1
send "\r"

# Wait for the command to complete
expect eof
