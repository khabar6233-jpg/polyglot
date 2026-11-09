"""Рисует значки приложения (синий квадрат с «Aa») без сторонних библиотек.

Запуск: python -I make_icons.py <папка web/icons>
"""
import struct
import sys
import zlib
from pathlib import Path

BLUE = (0x2C, 0x55, 0xD6)
WHITE = (255, 255, 255)

# Буква «A» (с отверстием) в координатах 0..108, как в значке Android-версии.
A_OUTER = [(30, 74), (42, 34), (50, 34), (62, 74), (55, 74), (52, 64), (40, 64), (37, 74)]
A_HOLE = [(42, 58), (50, 58), (46, 43)]


def inside_poly(x, y, poly):
    hit = False
    j = len(poly) - 1
    for i, (xi, yi) in enumerate(poly):
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def white_at(x, y):
    """Белая ли точка (в координатах 0..108)."""
    if inside_poly(x, y, A_OUTER) and not inside_poly(x, y, A_HOLE):
        return True
    # Буква «a»: кольцо и палочка справа.
    d2 = (x - 70) ** 2 + (y - 64) ** 2
    if 5.5 ** 2 <= d2 <= 11 ** 2:
        return True
    return 76 <= x <= 82 and 55 <= y <= 75


def png(size, path):
    ss = 3  # сглаживание: 3×3 точки на пиксель
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) * 108 / size
                    y = (py + (sy + 0.5) / ss) * 108 / size
                    hits += white_at(x, y)
            a = hits / (ss * ss)
            row += bytes(round(BLUE[c] * (1 - a) + WHITE[c] * a) for c in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for size in (180, 192, 512):
    png(size, out / f"icon-{size}.png")
    print("готово:", f"icon-{size}.png")
