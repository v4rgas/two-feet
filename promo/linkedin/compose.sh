#!/bin/bash
# The LinkedIn edit: the real fingerboard clip (4:5 crop, no watermark) crossfaded into the
# game recording at the match (source 5.72 s = game clip 1.58 s, a 5-frame fade at 30 fps),
# with the fingerboard clacks, then "Rio Samba" (Liborio Conti) from the transition to the
# end, normalised to -14 LUFS / -1 dBTP.
# Usage: twofeet-compose.sh <game.mp4> <kicker.png> <out.mp4>
set -e
GAME="$1"
KICKER="$2"
OUT="$3"
DIR=/home/juan/devel/bipbop-projects/skate/recordings/linkedin
SRC=$DIR/source/fingerboard.mp4
MUSIC=$DIR/source/rio-samba-liborio-conti.mp3
XF_OFFSET=5.72
XF_DUR=0.167
MUSIC_AT=5.50   # the samba starts under the clacks' fade-out (0.4 s overlap)
SRC_END=$(python3 -c "print(${XF_OFFSET} + ${XF_DUR})")
GAME_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$GAME")
TOTAL=$(python3 -c "print(round(${XF_OFFSET} + ${GAME_DUR}, 3))")
MUSIC_LEN=$(python3 -c "print(round(${TOTAL} - ${MUSIC_AT}, 3))")
MUSIC_FADE=$(python3 -c "print(round(${MUSIC_LEN} - 1.5, 3))")
echo "game ${GAME_DUR}s, total ${TOTAL}s, music ${MUSIC_LEN}s from ${MUSIC_AT}s"

# 1. The audio mix (clacks limited, samba faded in 0.3 s and out over the last 1.5 s).
MIX="
  [0:a]atrim=0:${SRC_END},asetpts=PTS-STARTPTS,aresample=48000,
    afade=t=out:st=$(python3 -c "print(${XF_OFFSET} - 0.25)"):d=0.4,
    alimiter=limit=0.6:level=false[clack];
  [1:a]atrim=0:${MUSIC_LEN},asetpts=PTS-STARTPTS,aresample=48000,
    afade=t=in:d=0.3,afade=t=out:st=${MUSIC_FADE}:d=1.5,
    adelay=$(python3 -c "print(int(${MUSIC_AT} * 1000))"):all=1[music];
  [clack][music]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=${TOTAL},atrim=0:${TOTAL}"
ffmpeg -loglevel error -y -i "$SRC" -i "$MUSIC" -filter_complex "${MIX}[a]" -map "[a]" -ac 2 /tmp/tf-mix.wav
# 2. Loudness: measure, then a linear two-pass loudnorm (-14 LUFS, -1 dBTP).
M=$(ffmpeg -hide_banner -i /tmp/tf-mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
MI=$(echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['input_i'])")
MTP=$(echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['input_tp'])")
MLRA=$(echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['input_lra'])")
MTH=$(echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['input_thresh'])")
MOFF=$(echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['target_offset'])")
echo "mix measured: ${MI} LUFS, ${MTP} dBTP"
ffmpeg -loglevel error -y -i /tmp/tf-mix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${MI}:measured_TP=${MTP}:measured_LRA=${MLRA}:measured_thresh=${MTH}:offset=${MOFF}:linear=true,alimiter=limit=0.84:level=false,aresample=48000" \
  -c:a aac -b:a 192k /tmp/tf-mix.m4a

# 3. The picture: the real clip graded for the upscale, the kicker, the crossfade into the game
#    (whose first second carries a warm, dim wash that bridges the room's light).
ffmpeg -loglevel error -y \
  -i "$SRC" -i "$GAME" -loop 1 -t "$SRC_END" -i "$KICKER" -i /tmp/tf-mix.m4a \
  -filter_complex "
    [0:v]trim=0:${SRC_END},setpts=PTS-STARTPTS,
      crop=352:440:0:92,
      scale=1080:1350:flags=lanczos,
      unsharp=5:5:0.55:5:5:0,
      noise=alls=5:allf=t,
      vignette=angle=PI/6,
      fps=60,format=yuv420p,setsar=1[real0];
    [2:v]format=rgba,fade=t=in:st=0.25:d=0.25:alpha=1,fade=t=out:st=2.3:d=0.4:alpha=1[kick];
    [real0][kick]overlay=0:0:shortest=1,format=yuv420p[real];
    [1:v]fps=60,format=yuv420p,setsar=1[game0];
    color=c=0x2a2016:s=1080x1350:r=60:d=1.6,format=rgba,colorchannelmixer=aa=0.5,fade=t=out:st=0.25:d=1.2:alpha=1[warm];
    [game0][warm]overlay=0:0:eof_action=pass,format=yuv420p[game];
    [real][game]xfade=transition=fade:duration=${XF_DUR}:offset=${XF_OFFSET},format=yuv420p[v]
  " \
  -map "[v]" -map 3:a \
  -c:v libx264 -preset slow -crf 17 -profile:v high -pix_fmt yuv420p \
  -c:a copy -movflags +faststart -t "$TOTAL" "$OUT"
ffprobe -v error -show_entries stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,bit_rate:format=duration,size -of compact "$OUT"
ffmpeg -hide_banner -i "$OUT" -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "Input Integrated|Input True Peak"
