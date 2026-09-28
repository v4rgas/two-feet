#!/bin/bash
# The LinkedIn edit (promo/linkedin/SCRIPT.md "Edit"): the real fingerboard clip (4:5 crop,
# no watermark) crossfaded into the game recording at the match (source 5.72 s = game clip
# 1.61 s, a 5-frame fade at 30 fps). Sound: the fingerboard clacks up to the cut, a faint
# room tone through the in-game grind, then "Rio Samba" (Liborio Conti) from the trick-out's
# landing (its first beat on the landing) to the end, normalised to -14 LUFS / -1 dBTP.
# Also writes a small preview (crf 26, 30 fps) next to the output.
# Usage: compose.sh <game.mp4> <out.mp4>
set -e
GAME="$1"
OUT="$2"
PREVIEW="${OUT%.mp4}-preview.mp4"
DIR=/home/juan/devel/bipbop-projects/skate/recordings/linkedin
SRC=$DIR/source/fingerboard.mp4
MUSIC=$DIR/source/rio-samba-liborio-conti.mp3
XF_OFFSET=5.72
XF_DUR=0.167
# The trick-out landing in the video (fingerboard-match.ts DESK_LAND_S through the desk
# clip's slow motion) and the track's first beat (0.049 s in): the samba starts so that its
# first beat lands on the landing.
DROP=9.852
FIRST_BEAT=0.049
MUSIC_AT=$(python3 -c "print(round(${DROP} - ${FIRST_BEAT}, 3))")
SRC_END=$(python3 -c "print(${XF_OFFSET} + ${XF_DUR})")
GAME_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$GAME")
TOTAL=$(python3 -c "print(round(${XF_OFFSET} + ${GAME_DUR}, 3))")
MUSIC_LEN=$(python3 -c "print(round(${TOTAL} - ${MUSIC_AT}, 3))")
MUSIC_FADE=$(python3 -c "print(round(${MUSIC_LEN} - 1.5, 3))")
echo "game ${GAME_DUR}s, total ${TOTAL}s, music from ${MUSIC_AT}s (${MUSIC_LEN}s)"

# 1. The audio: clacks (limited, out 5.60-6.00 s), room tone (brown noise ~ -52 dBFS, in
#    under the clacks' fade, out on the drop), the samba (a 20 ms fade-in, out over 1.5 s).
ROOM_LEN=$(python3 -c "print(round(${DROP} - 5.5 + 0.3, 3))")
MIX="
  [0:a]atrim=0:${SRC_END},asetpts=PTS-STARTPTS,aresample=48000,
    afade=t=out:st=5.60:d=0.40,alimiter=limit=0.6:level=false[clack];
  anoisesrc=color=brown:amplitude=0.01:sample_rate=48000:duration=${ROOM_LEN},
    lowpass=f=1200,afade=t=in:d=0.4,afade=t=out:st=$(python3 -c "print(round(${ROOM_LEN} - 0.35, 3))"):d=0.35,
    adelay=5500:all=1[room];
  [1:a]atrim=0:${MUSIC_LEN},asetpts=PTS-STARTPTS,aresample=48000,
    afade=t=in:d=0.02,afade=t=out:st=${MUSIC_FADE}:d=1.5,
    adelay=$(python3 -c "print(int(round(${MUSIC_AT} * 1000)))"):all=1[music];
  [clack][room][music]amix=inputs=3:normalize=0:duration=longest,apad=whole_dur=${TOTAL},atrim=0:${TOTAL}"
ffmpeg -loglevel error -y -i "$SRC" -i "$MUSIC" -filter_complex "${MIX}[a]" -map "[a]" -ac 2 /tmp/tf-mix.wav
# 2. Loudness: measure, then a linear two-pass loudnorm (-14 LUFS, -1 dBTP).
M=$(ffmpeg -hide_banner -i /tmp/tf-mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
J() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
echo "mix measured: $(J input_i) LUFS, $(J input_tp) dBTP"
ffmpeg -loglevel error -y -i /tmp/tf-mix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(J input_i):measured_TP=$(J input_tp):measured_LRA=$(J input_lra):measured_thresh=$(J input_thresh):offset=$(J target_offset):linear=true,alimiter=limit=0.84:level=false,aresample=48000" \
  -c:a aac -b:a 192k /tmp/tf-mix.m4a

# 3. The picture: the real clip graded for the upscale, crossfaded into the game (whose
#    first seconds carry the desk look, set in the engine).
ffmpeg -loglevel error -y \
  -i "$SRC" -i "$GAME" -i /tmp/tf-mix.m4a \
  -filter_complex "
    [0:v]trim=0:${SRC_END},setpts=PTS-STARTPTS,
      crop=352:440:0:92,
      scale=1080:1350:flags=lanczos,
      unsharp=5:5:0.55:5:5:0,
      noise=alls=5:allf=t,
      vignette=angle=PI/6,
      fps=60,format=yuv420p,setsar=1[real];
    [1:v]fps=60,format=yuv420p,setsar=1[game];
    [real][game]xfade=transition=fade:duration=${XF_DUR}:offset=${XF_OFFSET},format=yuv420p[v]
  " \
  -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p \
  -c:a copy -movflags +faststart -t "$TOTAL" "$OUT"
# 4. The preview: 30 fps, crf 26 (to send around).
ffmpeg -loglevel error -y -i "$OUT" -vf fps=30 -c:v libx264 -preset slow -crf 26 -profile:v high \
  -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$PREVIEW"
for f in "$OUT" "$PREVIEW"; do
  ffprobe -v error -show_entries stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,bit_rate:format=duration,size -of compact "$f"
done
ffmpeg -hide_banner -i "$OUT" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
