# Sourced, not executed, by .husky/pre-commit and .husky/pre-push. Puts a Node
# whose major matches .node-version first on PATH for the rest of the hook.
#
# Git hands a hook the PATH of whatever started git, and the hook's own shell
# reads no startup files. Version managers (fnm, nvm, mise, ...) are usually
# activated from interactive shell startup (~/.zshrc), so an editor, a GUI git
# client or an agent harness running `zsh -lc` starts git with a PATH whose
# first `node` is some other install - most often Homebrew's current `node`,
# which `brew shellenv` in ~/.zprofile puts ahead of everything. The terminal
# gets the pinned Node; the hook silently does not, and steps fail on a Node
# major CI never runs.
#
# This only selects among Nodes already installed, preferring the highest
# matching version. The install trees of fnm, nvm, mise, asdf, volta and
# Homebrew's node@<major> keg hold only Node's own binaries, so a match there is
# prepended as a whole directory and wins over a PATH match. A match found only
# in a general PATH entry (/usr/local/bin, /usr/bin) is not prepended as is:
# that would also reorder git, pnpm and every other tool the steps run, so a
# directory holding just a `node` link to it is prepended instead, cached under
# ${XDG_CACHE_HOME:-$HOME/.cache}/inkeep-hook-node. If that link cannot be
# created, the whole PATH entry is prepended after all, since the wrong Node is
# the known failure, and a second stderr line says so. It never installs
# anything and never fails the hook. With no match, PATH is left alone and a
# warning names the mismatch.
#
# Reads .node-version from the cwd, which git sets to the worktree top.

_hsn_want=""
[ -r .node-version ] && _hsn_want=$(tr -d ' \t\r\n' < .node-version)
_hsn_want=${_hsn_want#v}
_hsn_want=${_hsn_want%%.*}

_hsn_version() {
  [ -x "$1/node" ] || return 1
  _hsn_v=$("$1/node" --version 2>/dev/null) || return 1
  printf '%s\n' "${_hsn_v#v}"
}

# $1: 1 for a Node-only install directory, 0 for a general PATH entry.
_hsn_consider() {
  _hsn_cv=$(_hsn_version "$2") || return 0
  case $_hsn_cv in
    "$_hsn_want".*) ;;
    *) return 0 ;;
  esac
  _hsn_rest=${_hsn_cv#*.}
  _hsn_found="$_hsn_found$1 ${_hsn_rest%%.*} ${_hsn_rest#*.} $2
"
}

case $_hsn_want in
  '' | *[!0-9]*) ;;
  *)
    _hsn_have=""
    _hsn_have_dir=$(command -v node 2>/dev/null) && _hsn_have=$(_hsn_version "${_hsn_have_dir%/*}") || :
    case $_hsn_have in
      "$_hsn_want".*) ;;
      *)
        _hsn_found=""
        _hsn_ifs=$IFS
        IFS=:
        for _hsn_d in $PATH; do
          IFS=$_hsn_ifs
          [ -n "$_hsn_d" ] && _hsn_consider 0 "$_hsn_d"
        done
        IFS=$_hsn_ifs
        _hsn_data=${XDG_DATA_HOME:-$HOME/.local/share}
        for _hsn_d in \
          "${FNM_DIR:-$_hsn_data/fnm}/node-versions/v$_hsn_want".*/installation/bin \
          "$HOME/Library/Application Support/fnm/node-versions/v$_hsn_want".*/installation/bin \
          "$HOME/.fnm/node-versions/v$_hsn_want".*/installation/bin \
          "${NVM_DIR:-$HOME/.nvm}/versions/node/v$_hsn_want".*/bin \
          "${MISE_DATA_DIR:-$_hsn_data/mise}/installs/node/$_hsn_want".*/bin \
          "${ASDF_DATA_DIR:-$HOME/.asdf}/installs/nodejs/$_hsn_want".*/bin \
          "${VOLTA_HOME:-$HOME/.volta}/tools/image/node/$_hsn_want".*/bin \
          "${HOMEBREW_PREFIX:-/opt/homebrew}/opt/node@$_hsn_want/bin" \
          "${HOMEBREW_PREFIX:-/usr/local}/opt/node@$_hsn_want/bin"; do
          _hsn_consider 1 "$_hsn_d"
        done
        _hsn_pick=$(printf '%s' "$_hsn_found" | sort -k1,1n -k2,2n -k3,3n | tail -n 1)
        if [ -n "$_hsn_have_dir" ]; then
          _hsn_had="v${_hsn_have:-?} at $_hsn_have_dir"
        else
          _hsn_had="no node on PATH"
        fi
        if [ -n "$_hsn_pick" ]; then
          _hsn_dir=${_hsn_pick#* }
          _hsn_dir=${_hsn_dir#* }
          _hsn_dir=${_hsn_dir#* }
          _hsn_prepend=$_hsn_dir
          _hsn_note=""
          case $_hsn_pick in
            0\ *)
              _hsn_link="${XDG_CACHE_HOME:-$HOME/.cache}/inkeep-hook-node/$(printf '%s' "$_hsn_dir" | cksum | cut -d' ' -f1)"
              mkdir -p "$_hsn_link" 2>/dev/null || :
              [ -L "$_hsn_link/node" ] || ln -s "$_hsn_dir/node" "$_hsn_link/node" 2>/dev/null || :
              if [ -L "$_hsn_link/node" ]; then
                _hsn_prepend=$_hsn_link
              else
                _hsn_note="  Could not create a node-only link under ${_hsn_link%/*}, so all of $_hsn_dir now comes first on PATH, ahead of the git, pnpm and other tools earlier entries provided."
              fi
              ;;
          esac
          PATH="$_hsn_prepend:$PATH"
          export PATH
          echo "${0##*/}: using Node v$(_hsn_version "$_hsn_dir") from $_hsn_dir (.node-version pins $_hsn_want; PATH had $_hsn_had)" >&2
          [ -z "$_hsn_note" ] || echo "$_hsn_note" >&2
        else
          echo "${0##*/}: .node-version pins Node $_hsn_want but PATH has $_hsn_had, and no installed Node $_hsn_want was found." >&2
          echo "  Steps will run on the wrong Node. Install it with your version manager (e.g. 'fnm install $_hsn_want')." >&2
        fi
        ;;
    esac
    ;;
esac

unset _hsn_want _hsn_have _hsn_have_dir _hsn_found _hsn_ifs _hsn_d _hsn_data \
  _hsn_pick _hsn_had _hsn_dir _hsn_v _hsn_cv _hsn_rest _hsn_prepend _hsn_link _hsn_note
unset -f _hsn_version _hsn_consider
