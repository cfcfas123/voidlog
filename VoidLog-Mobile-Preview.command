#!/bin/zsh
set -e

cd "$(dirname "$0")"

PORT="${VOIDLOG_PORT:-5176}"
URL="http://127.0.0.1:${PORT}/mobile-preview.html?v=0.2"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "python3를 찾지 못했습니다. Python 3 설치가 필요합니다."
  read -r "?Enter를 누르면 닫습니다."
  exit 1
fi

echo "Void Log Mobile Preview"
echo "Version: 0.2"
echo "URL: ${URL}"
echo ""
echo "브라우저가 열리면 PC에서 모바일 화면을 확인할 수 있습니다."
echo "종료하려면 이 창에서 Ctrl+C를 누르세요."
echo ""

open "${URL}"
"${PYTHON_BIN}" -m http.server "${PORT}" --bind 127.0.0.1
