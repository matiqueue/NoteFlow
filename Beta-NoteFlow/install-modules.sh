while IFS= read -r line; do
  npm install "$line"
done < requirements.txt