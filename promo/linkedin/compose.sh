#!/bin/bash
# The LinkedIn edit (promo/linkedin/SCRIPT.md "Edit"): the real fingerboard clip (4:5 crop,
# no watermark) dissolving into the game recording over the lock (a 0.65 s crossfade,
# source 5.40–6.05 s = game clip 1.29–1.94 s, both moving). Sound with no gap: "Rio Samba"
# (Liborio Conti) comes in quietly under the fingerboard clacks and ramps up (a log / dB-linear
# curve, −24 dB → 0 dB) through the dissolve and the grind, reaching full level on a downbeat
# at the trick-out landing; the clacks fade out under it (qsin) over 1.9 s. Normalised to
# −14 LUFS / −1 dBTP. Also writes a small preview (crf 26, 30 fps) and the seam's RMS envelope.
# Usage: compose.sh <game.mp4> <out.mp4>
set -e
GAME="$1"
OUT="$2"
PREVIEW="${OUT%.mp4}-preview.mp4"
DIR=/home/juan/devel/bipbop-projects/skate/recordings/linkedin
SRC=$DIR/source/fingerboard.mp4
MUSIC=$DIR/source/rio-samba-liborio-conti.mp3
XF_OFFSET=5.40
XF_DUR=0.65
# The trick-out landing in the video (fingerboard-match.ts DESK_LAND_S through the desk clip's
# slow motion). The track's beats: the first at 0.049 s, a bar every 4 × 60/122.25 s. The track
# starts so that the downbeat of its bar 4 (7.902 s in) hits the landing (it comes in 3.4 s
# before the dissolve, under the clacks, and covers the real clip's own quiet moments).
DROP=9.829
LAND_IN_TRACK=$(python3 -c "print(round(0.049 + 4 * 4 * 60 / 122.25, 4))")
MUSIC_AT=$(python3 -c "print(round(${DROP} - ${LAND_IN_TRACK}, 3))")
RAMP_DB=24
SRC_VIDEO_END=$(python3 -c "print(${XF_OFFSET} + ${XF_DUR})")
CLACK_FADE_AT=5.00
CLACK_FADE=1.90
SRC_AUDIO_END=$(python3 -c "print(${CLACK_FADE_AT} + ${CLACK_FADE})")
GAME_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$GAME")
TOTAL=$(python3 -c "print(round(${XF_OFFSET} + ${GAME_DUR}, 3))")
MUSIC_LEN=$(python3 -c "print(round(${TOTAL} - ${MUSIC_AT}, 3))")
MUSIC_FADE=$(python3 -c "print(round(${MUSIC_LEN} - 1.5, 3))")
RAMP_S=$(python3 -c "print(round(${DROP} - ${MUSIC_AT}, 3))")
echo "game ${GAME_DUR}s, total ${TOTAL}s; music from ${MUSIC_AT}s (ramp ${RAMP_S}s to the landing at ${DROP}s)"

# 1. The audio. The music's volume follows a dB-linear ramp (t in the track's own time):
#    −24 dB at its start → 0 dB at the landing, then flat; the clacks fade out with qsin.
VOL="if(lt(t,${RAMP_S}),pow(10,(-${RAMP_DB}*(1-t/${RAMP_S}))/20),1)"
MIX="
  [0:a]atrim=0:${SRC_AUDIO_END},asetpts=PTS-STARTPTS,aresample=48000,
    alimiter=limit=0.6:level=false,
    afade=t=out:st=${CLACK_FADE_AT}:d=${CLACK_FADE}:curve=qsin[clack];
  [1:a]atrim=0:${MUSIC_LEN},asetpts=PTS-STARTPTS,aresample=48000,
    volume='${VOL}':eval=frame,
    afade=t=out:st=${MUSIC_FADE}:d=1.5,
    adelay=$(python3 -c "print(int(round(${MUSIC_AT} * 1000)))"):all=1[music];
  [clack][music]amix=inputs=2:normalize=0:duration=longest,apad=whole_dur=${TOTAL},atrim=0:${TOTAL}"
ffmpeg -loglevel error -y -i "$SRC" -i "$MUSIC" -filter_complex "${MIX}[a]" -map "[a]" -ac 2 /tmp/tf-mix.wav
# 2. Loudness: measure, then a linear two-pass loudnorm (−14 LUFS, −1 dBTP).
M=$(ffmpeg -hide_banner -i /tmp/tf-mix.wav -af loudnorm=I=-14:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
J() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
echo "mix measured: $(J input_i) LUFS, $(J input_tp) dBTP"
ffmpeg -loglevel error -y -i /tmp/tf-mix.wav -af "loudnorm=I=-14:TP=-2:LRA=11:measured_I=$(J input_i):measured_TP=$(J input_tp):measured_LRA=$(J input_lra):measured_thresh=$(J input_thresh):offset=$(J target_offset):linear=true,alimiter=limit=0.79:level=false,aresample=48000" \
  -c:a aac -b:a 192k /tmp/tf-mix.m4a

# 3. The picture: the real clip graded for the upscale, dissolving into the game.
ffmpeg -loglevel error -y \
  -i "$SRC" -i "$GAME" -i /tmp/tf-mix.m4a \
  -filter_complex "
    [0:v]trim=0:${SRC_VIDEO_END},setpts=PTS-STARTPTS,
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
# 5. The seam's RMS envelope (0–14 s, 50 ms windows): a table for the check.
ffmpeg -loglevel error -y -t 14 -i "$OUT" -af "aresample=48000,asetnsamples=2400,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=/tmp/tf-rms.txt" -f null -
