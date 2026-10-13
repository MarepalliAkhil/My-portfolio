#!/bin/sh
# Run this AFTER you have created an EMPTY repository named "My portfolio" on github.com
# (GitHub turns the space into a dash, so its address is github.com/MarepalliAkhil/My-portfolio).
git init
git add .
git commit -m "Akhil Marepalli Portfolio"
git branch -M main
git remote add origin https://github.com/MarepalliAkhil/My-portfolio.git
git push -u origin main
