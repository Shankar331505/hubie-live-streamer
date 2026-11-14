#!/bin/zsh
# Copy newly downloaded Flow variants (matched by id prefix in filename) into assets/flow-parts
D=~/Downloads; P=/Users/shankar/IdeaProjects/Hubie/assets/flow-parts
typeset -A M; M=(0d52e3fd nohat e57fbee8 eyes_wide 20532e3d eyes_left 3fa92ffc eyes_right a82e6779 eyes_sleepy 79d35016 hand_point 3a76edd5 hand_fist 82e4863a hand_palm)
for id name in ${(kv)M}; do
  files=($D/*${id}_2K.jpg(N.om))
  if (( ${#files} > 0 )); then cp "${files[1]}" $P/$name.jpg && echo "ok $name"; else echo "missing $name"; fi
done
