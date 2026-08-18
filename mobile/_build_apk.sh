#!/bin/bash
cd ~/build/mobile
eas build --platform android --profile preview --local 2>&1 | tee build-apk.log
