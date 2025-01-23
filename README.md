# Trucksbook Activity Checker

## Overview
Trucksbook Activity Checker is a Chrome extension that helps you check the activity of a Trucksbook user. It can fetch the last delivery date from the Trucksbook profile or from a Google Sheets document containing Trucksbook user IDs.

## Features
- Fetch the last delivery date from Trucksbook profile.
- Fetch the last delivery date from a Google Sheets document by middle-clicking on a cell containing a Trucksbook user ID.
- Display the fetched data in a popup.
- Automatically copy the last delivery date to the clipboard.

## Installation
1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click on "Load unpacked" and select the directory containing the extension files.

## Usage

### Trucksbook Profile
1. Navigate to a Trucksbook profile page (e.g., `https://trucksbook.eu/profile/USER_ID`).
2. Click on the extension icon in the Chrome toolbar to open the popup.
3. The extension will automatically fetch and display the last delivery date.

### Google Sheets
1. Open a Google Sheets document that contains Trucksbook user IDs.
2. Middle-click on a cell containing a Trucksbook user ID.
3. The extension will open the popup and display the last delivery date for the clicked user ID.

## Permissions
This extension requires the following permissions:
- `activeTab`: To access the current tab's URL.
- `storage`: To store and retrieve the Trucksbook user ID.

## License
This project is licensed under the MIT License.