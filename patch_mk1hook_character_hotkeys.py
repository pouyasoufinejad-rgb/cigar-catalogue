from pathlib import Path

path = Path("upstream/MK1Hook/plugin/Menu.cpp")
text = path.read_text(encoding="utf-8-sig")

old = """\t\tif (keyBindPressed)
\t\t{
\t\t\tMKCharacter* obj = (MKCharacter*)GetGameInfo()->GetObj(PLAYER1);
\t\t\tif (keyBind.type == SCRIPT_P2)
\t\t\t\tobj = (MKCharacter*)GetGameInfo()->GetObj(PLAYER2);


\t\t\tif (keyBind.callType == Keybind_SpecialMove || keyBind.callType == Keybind_DataFunction)
"""

new = """\t\tif (keyBindPressed)
\t\t{
\t\t\tPLAYER_NUM targetPlayer = PLAYER1;
\t\t\tif (keyBind.type == SCRIPT_P2)
\t\t\t\ttargetPlayer = PLAYER2;

\t\t\tMKCharacter* obj = (MKCharacter*)GetGameInfo()->GetObj(targetPlayer);

\t\t\t// Fighter special-move hotkeys are character-specific.
\t\t\t// Stock MK1Hook executes a stored move definition on whichever fighter
\t\t\t// currently occupies the player slot. Guard fighter scripts so a move
\t\t\t// bound from Homelander cannot execute on Omni-Man, Johnny Cage, etc.
\t\t\tif (keyBind.callType == Keybind_SpecialMove)
\t\t\t{
\t\t\t\tchar* currentCharacterName = GetCharacterName(targetPlayer);
\t\t\t\tif (currentCharacterName)
\t\t\t\t{
\t\t\t\t\tstd::string boundScript = keyBind.scriptName;
\t\t\t\t\tstd::transform(boundScript.begin(), boundScript.end(), boundScript.begin(), tolower);

\t\t\t\t\tsize_t slash = boundScript.find_last_of("\\\\/");
\t\t\t\t\tif (slash != std::string::npos)
\t\t\t\t\t\tboundScript = boundScript.substr(slash + 1);

\t\t\t\t\tif (boundScript.size() >= 4 && boundScript.compare(boundScript.size() - 4, 4, ".mko") == 0)
\t\t\t\t\t\tboundScript.resize(boundScript.size() - 4);

\t\t\t\t\tstd::string currentCharacter = currentCharacterName;
\t\t\t\t\tstd::transform(currentCharacter.begin(), currentCharacter.end(), currentCharacter.begin(), tolower);

\t\t\t\t\tbool isFighterScript =
\t\t\t\t\t\tboundScript.rfind("char_", 0) == 0 ||
\t\t\t\t\t\tboundScript.rfind("boss_", 0) == 0 ||
\t\t\t\t\t\tboundScript.rfind("ch15_", 0) == 0;

\t\t\t\t\tif (isFighterScript && boundScript != currentCharacter)
\t\t\t\t\t\tcontinue;
\t\t\t\t}
\t\t\t}


\t\t\tif (keyBind.callType == Keybind_SpecialMove || keyBind.callType == Keybind_DataFunction)
"""

if old not in text:
    raise SystemExit("Expected MK1Hook 0.5.9 hotkey block not found; refusing to patch the wrong source.")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8", newline="\n")
print("Patched", path)
