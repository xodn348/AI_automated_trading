#!/bin/bash
set -e

# Parse command line arguments
version=""
beta=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --beta)
      beta=true
      shift
      ;;
    *)
      if [ -z "$version" ]; then
        version="$1"
      fi
      shift
      ;;
  esac
done

echo "DEBUG: version is '$version'"
echo "DEBUG: beta is '$beta'"

# Set project name based on beta flag
project_name="solanamevbotonchain"
if [ "$beta" = true ]; then
  project_name="solanamevbotonchainbeta"
fi

if [ -n "$version" ]; then
    # Version parameter is provided
    echo "📦 Version parameter detected: $version"
    download_link="https://sourceforge.net/projects/$project_name/files/smb-onchain-$version.zip"

    echo "🌐 Constructed download link: $download_link"

    # Check if the URL exists
    if curl --output /dev/null --silent --head --fail "$download_link"; then
        echo "✅ Version $version found."
    else
        echo "❌ Version $version not found."
        exit 1
    fi
else
    # No version parameter, proceed with current logic
    URL="https://sourceforge.net/projects/$project_name/files/"

    echo "🌐 Fetching project files page from SourceForge..."

    # Modify grep to use -E instead of -P and adjust the regex
    download_link=$(curl -s "$URL" | grep -Eo 'href="[^"]+\.zip/download"' | head -n 1 | sed -E 's/href="([^"]+)\/download"/\1/')

    if [ -z "$download_link" ]; then
      echo "❌ No archive found."
      exit 1
    fi

    # Check if download_link is relative
    if [[ ! $download_link =~ ^https?:// ]]; then
        # Since the download_link is relative, prepend the base URL
        download_link="https://sourceforge.net${download_link}"
    fi

    echo "Latest archive link: $download_link"
    echo "✅ Latest archive found."

    # Extract version number using regex
    if [[ $download_link =~ ([0-9]+\.[0-9]+\.[0-9]+) ]]; then
      version="${BASH_REMATCH[1]}"
      echo "Version number: $version"
    else
      echo "Version number not found"
    fi
fi

echo "📥 Downloading archive..."

filename=$(basename "$download_link")
output_file="./$filename"

curl -sL "$download_link" -o "$output_file"

if [ $? -ne 0 ]; then
  echo "❌ Failed to download the archive."
  exit 1
fi

echo "✅ Downloaded successfully."
echo "📂 Extracting into current directory..."

if [ -f "$output_file" ]; then
  unzip -o "$output_file"

  if [ $? -ne 0 ]; then
    echo "❌ Failed to extract the archive."
    exit 1
  fi

  echo "✅ Extraction completed."
else
  echo "❌ Failed to find or download the archive."
  exit 1
fi

echo "🧹 Cleaning up..."
rm -f "$output_file"

echo "✨ Process completed successfully!"
