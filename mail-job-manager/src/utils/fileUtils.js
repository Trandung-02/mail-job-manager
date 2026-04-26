/**
 * File Utilities
 * File system helper functions
 */

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const logger = require("./logger");

const FileUtils = {
  /**
   * Get Chrome profiles path based on OS
   * @returns {string} Path to Chrome User Data directory
   */
  getChromeProfilesPath() {
    const platform = os.platform();
    const homeDir = os.homedir();

    const paths = {
      win32: path.join(homeDir, "AppData", "Local", "Google", "Chrome", "User Data"),
      darwin: path.join(homeDir, "Library", "Application Support", "Google", "Chrome"),
      linux: path.join(homeDir, ".config", "google-chrome"),
    };

    return paths[platform] || paths.linux;
  },

  /**
   * Check if path exists
   * @param {string} filePath - Path to check
   * @returns {boolean} Path exists
   */
  pathExists(filePath) {
    try {
      return fsSync.existsSync(filePath);
    } catch {
      return false;
    }
  },

  /**
   * Read JSON file safely
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Object|null>} Parsed JSON or null
   */
  async readJsonFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      logger.warn(`Không thể đọc file ${filePath}:`, error.message);
      return null;
    }
  },
};

module.exports = FileUtils;
