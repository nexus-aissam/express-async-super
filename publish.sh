#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Ensure working directory is clean
if [[ -n $(git status -s) ]]; then
  echo -e "${RED}Error: Working directory is not clean. Commit or stash changes before publishing.${NC}"
  exit 1
fi

# Pull latest changes
echo -e "${BLUE}Pulling latest changes...${NC}"
git pull

# Build the package
echo -e "${BLUE}Building package...${NC}"
npm run build:prod

if [ $? -ne 0 ]; then
  echo -e "${RED}Build failed. Cannot publish.${NC}"
  exit 1
fi

# Get current version
current_version=$(node -e "console.log(require('./package.json').version)")
echo -e "${BLUE}Current version: ${GREEN}${current_version}${NC}"

# Ask for version type
echo -e "${YELLOW}What kind of version update?${NC}"
echo "1) Patch (bug fixes)"
echo "2) Minor (new features, backwards compatible)"
echo "3) Major (breaking changes)"
echo "4) Custom version"
read -p "Enter choice (1-4): " version_choice

case $version_choice in
  1)
    new_version=$(npm version patch --no-git-tag-version)
    ;;
  2)
    new_version=$(npm version minor --no-git-tag-version)
    ;;
  3)
    new_version=$(npm version major --no-git-tag-version)
    ;;
  4)
    read -p "Enter custom version (e.g., 1.2.3): " custom_version
    new_version="v$custom_version"
    npm version $custom_version --no-git-tag-version
    ;;
  *)
    echo -e "${RED}Invalid choice. Exiting.${NC}"
    exit 1
    ;;
esac

echo -e "${BLUE}New version: ${GREEN}${new_version}${NC}"

# Confirm publication
read -p "Ready to publish this version? (y/n): " confirm
if [[ $confirm != "y" && $confirm != "Y" ]]; then
  echo -e "${YELLOW}Publication canceled.${NC}"
  exit 0
fi

# Publish to npm
echo -e "${BLUE}Publishing to npm...${NC}"
npm publish --access public

if [ $? -ne 0 ]; then
  echo -e "${RED}Publication failed.${NC}"
  exit 1
fi

# Commit version change
git add package.json
git commit -m "chore: bump version to ${new_version}"

# Create git tag
git tag ${new_version}

# Push changes and tags
echo -e "${BLUE}Pushing changes and tags...${NC}"
git push
git push --tags

echo -e "${GREEN}Publication complete! Version ${new_version} has been published.${NC}"