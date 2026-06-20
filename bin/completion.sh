#!/bin/bash

# Atabey CLI Bash/Zsh Completion
# To enable, add this to your .bashrc or .zshrc:
# source /path/to/atabey/bin/completion.sh

_atabey_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    opts="init check status trace:new trace:replay update_project_memory plan plan:submit orchestrate loop verify-contract update-contract dashboard validate validate-al-registry check:al version help git:commit git:sync check:compliance explorer:graph explorer:audit knowledge:update knowledge:search log:action run-script security:audit check:lint approve create-agent mcp index quickstart"

    if [[ ${cur} == @* ]] ; then
        local agents="@manager @security @architect @backend @frontend @mobile @quality @database @devops @analyst @native @explorer @git"
        COMPREPLY=( $(compgen -W "${agents}" -- ${cur}) )
        return 0
    fi

    case "${prev}" in
        atabey)
            COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
            return 0
            ;;
        *)
            ;;
    esac
}

complete -F _atabey_completion atabey
