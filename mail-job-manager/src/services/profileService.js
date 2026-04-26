/**
 * Profile Service
 * Handles Chrome profile operations
 */

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const FileUtils = require("../utils/fileUtils");
const logger = require("../utils/logger");

const ProfileService = {
  /**
   * Get all Chrome profiles
   * @returns {Promise<Array>} Array of profile objects
   */
  async getProfiles() {
    const profilesPath = FileUtils.getChromeProfilesPath();
    const profiles = [];

    if (!FileUtils.pathExists(profilesPath)) {
      return profiles;
    }

    try {
      const entries = await fs.readdir(profilesPath, { withFileTypes: true });

      const profileDirs = entries
        .filter((entry) => {
          return (
            entry.isDirectory() && (entry.name === "Default" || entry.name.startsWith("Profile "))
          );
        })
        .map((entry) => entry.name);

      for (const profileDir of profileDirs) {
        const profile = await this.getProfileInfo(profileDir);
        if (profile) {
          profiles.push(profile);
        }
      }
    } catch (error) {
      logger.error("Lỗi khi đọc thư mục profiles:", error);
    }

    return profiles;
  },

  /**
   * Get profile information
   * @param {string} profileDir - Profile directory name
   * @returns {Promise<Object|null>} Profile object or null
   */
  async getProfileInfo(profileDir) {
    const profilesPath = FileUtils.getChromeProfilesPath();
    const profilePath = path.join(profilesPath, profileDir);
    const preferencesPath = path.join(profilePath, "Preferences");

    let email = null;
    let name = profileDir; // Default fallback

    if (FileUtils.pathExists(preferencesPath)) {
      const prefs = await FileUtils.readJsonFile(preferencesPath);
      if (prefs) {
        // Lấy thông tin từ account_info (Gmail account)
        // Kiểm tra tất cả các account trong account_info để tìm account có email và tên hiển thị đầy đủ
        if (prefs.account_info && prefs.account_info.length > 0) {
          // Debug: Log toàn bộ account_info để xem cấu trúc (chỉ log một lần để tránh spam)
          if (process.env.DEBUG_PROFILES === "true") {
            logger.debug(
              `🔍 Debug account_info cho profile ${profileDir}:`,
              JSON.stringify(prefs.account_info, null, 2)
            );
          }

          // Hàm helper để lấy tên từ một account info
          const getNameFromAccount = (accountInfo) => {
            let accountName = null;

            // Bước 1: Ưu tiên các trường chứa tên đầy đủ (display name)
            // Đây là tên hiển thị đầy đủ trên Gmail, không bị cắt/ngắt
            const fullNameFields = ["display_name", "displayName", "full_name", "fullName", "name"];

            for (const field of fullNameFields) {
              if (
                accountInfo[field] &&
                typeof accountInfo[field] === "string" &&
                accountInfo[field].trim() !== ""
              ) {
                // Lấy toàn bộ chuỗi, không truncate, không split, không giới hạn độ dài
                accountName = accountInfo[field].trim();
                logger.debug(`✅ Lấy tên đầy đủ từ trường "${field}": "${accountName}"`);
                return accountName;
              }
            }

            // Bước 2: Nếu không tìm thấy tên đầy đủ, ghép given_name + family_name
            const givenName = accountInfo.given_name || accountInfo.givenName || "";
            const familyName = accountInfo.family_name || accountInfo.familyName || "";

            if (givenName || familyName) {
              // Ghép tên và họ với khoảng trắng, đảm bảo không mất ký tự, giữ nguyên khoảng trắng
              const parts = [givenName.trim(), familyName.trim()].filter((part) => part !== "");
              if (parts.length > 0) {
                accountName = parts.join(" "); // Không trim ở đây để giữ khoảng trắng giữa các phần
                logger.debug(`✅ Ghép tên từ given_name + family_name: "${accountName}"`);
                return accountName;
              }
            }

            // Bước 3: Kiểm tra tất cả các keys còn lại trong accountInfo để tìm tên hiển thị
            for (const key in accountInfo) {
              if (
                Object.prototype.hasOwnProperty.call(accountInfo, key) &&
                typeof accountInfo[key] === "string" &&
                accountInfo[key].trim() !== "" &&
                key.toLowerCase().includes("name")
              ) {
                accountName = accountInfo[key].trim();
                logger.debug(`✅ Lấy tên từ trường "${key}": "${accountName}"`);
                return accountName;
              }
            }

            return null;
          };

          // Duyệt qua tất cả các account trong account_info
          for (const accountInfo of prefs.account_info) {
            // Lấy email từ account đầu tiên nếu chưa có
            if (!email && accountInfo.email) {
              email = accountInfo.email;
            }

            // Lấy tên từ account này
            const accountName = getNameFromAccount(accountInfo);
            if (accountName && accountName.trim() !== "") {
              name = accountName;
              // Nếu đã tìm thấy tên đầy đủ từ display_name hoặc full_name, dừng lại
              // Nếu chỉ tìm thấy từ given_name + family_name, tiếp tục tìm account khác có display_name
              const hasFullName =
                accountInfo.display_name ||
                accountInfo.displayName ||
                accountInfo.full_name ||
                accountInfo.fullName ||
                accountInfo.name;

              if (hasFullName) {
                break; // Đã tìm thấy tên đầy đủ, không cần tìm thêm
              }
            }
          }
        }

        // Thử tìm trong các phần khác của Preferences nếu không tìm thấy
        if (name === profileDir) {
          // Kiểm tra account_manager với cùng logic ưu tiên
          if (prefs.account_manager && prefs.account_manager.accounts) {
            const accounts = Array.isArray(prefs.account_manager.accounts)
              ? prefs.account_manager.accounts
              : Object.values(prefs.account_manager.accounts || {});

            for (const account of accounts) {
              if (account.email === email) {
                // Ưu tiên tên đầy đủ trước
                const fullNameFields = [
                  "display_name",
                  "displayName",
                  "full_name",
                  "fullName",
                  "name",
                ];

                for (const field of fullNameFields) {
                  if (
                    account[field] &&
                    typeof account[field] === "string" &&
                    account[field].trim() !== ""
                  ) {
                    name = account[field].trim();
                    logger.debug(`✅ Lấy tên đầy đủ từ account_manager.${field}: "${name}"`);
                    break;
                  }
                }

                // Nếu không tìm thấy, ghép given_name + family_name
                if (name === profileDir) {
                  const givenName = account.given_name || account.givenName || "";
                  const familyName = account.family_name || account.familyName || "";

                  if (givenName || familyName) {
                    const parts = [givenName, familyName].filter(
                      (part) => part && part.trim() !== ""
                    );
                    if (parts.length > 0) {
                      name = parts.join(" ").trim();
                      logger.debug(
                        `✅ Ghép tên từ account_manager (given_name + family_name): "${name}"`
                      );
                    }
                  }
                }

                if (name !== profileDir) {
                  break;
                }
              }
            }
          }
        }

        // Nếu không tìm thấy tên từ account_info, thử lấy từ profile.name (fallback)
        if (name === profileDir && prefs.profile && prefs.profile.name) {
          name = prefs.profile.name;
        }
      }
    }

    // Nếu vẫn không tìm thấy name nhưng có email, dùng email (hoặc phần trước @) làm name
    // Thay vì dùng profileDir (tên thư mục) làm fallback
    if (name === profileDir && email) {
      // Lấy phần trước @ của email làm name
      const emailName = email.split("@")[0];
      name = emailName;
      logger.info(`ℹ️ Không tìm thấy name từ profile, sử dụng email làm name: "${name}"`);
    }

    // Log kết quả
    logger.debug(`✅ Profile ${profileDir}: email=${email}, name="${name}"`);

    return {
      name,
      directory: profileDir,
      path: profilePath,
      email,
    };
  },

  /**
   * Find profile directory by name or directory
   * @param {string} profileName - Profile name or directory
   * @returns {Promise<{directory: string|null, availableProfiles: Array}>} Profile directory and available profiles
   */
  async findProfileDirectory(profileName) {
    const profilesPath = FileUtils.getChromeProfilesPath();

    if (!FileUtils.pathExists(profilesPath)) {
      logger.warn(`Chrome profiles path không tồn tại: ${profilesPath}`);
      return { directory: null, availableProfiles: [] };
    }

    // Get all available profiles first
    const profiles = await this.getProfiles();
    logger.debug(`Đang tìm profile: "${profileName}"`);
    logger.debug(
      `Có ${profiles.length} profiles có sẵn:`,
      profiles.map((p) => `${p.name} (${p.directory})`)
    );

    // Check if it's a directory name (exact match)
    const profilePath = path.join(profilesPath, profileName);
    if (FileUtils.pathExists(profilePath)) {
      // Verify it's actually a profile directory
      const stats = fsSync.statSync(profilePath);
      if (
        stats.isDirectory() &&
        (profileName === "Default" || profileName.startsWith("Profile "))
      ) {
        logger.info(`Tìm thấy profile directory: ${profileName}`);
        return { directory: profileName, availableProfiles: profiles };
      }
    }

    // Search in all profiles by directory (case-insensitive)
    let found = profiles.find((p) => p.directory.toLowerCase() === profileName.toLowerCase());

    // If not found by directory, search by name (case-insensitive)
    if (!found) {
      found = profiles.find((p) => p.name.toLowerCase() === profileName.toLowerCase());
    }

    // If still not found, try partial match
    if (!found) {
      found = profiles.find(
        (p) =>
          p.directory.toLowerCase().includes(profileName.toLowerCase()) ||
          p.name.toLowerCase().includes(profileName.toLowerCase())
      );
    }

    if (found) {
      logger.info(`Tìm thấy profile: ${found.name} (${found.directory})`);
    } else {
      logger.warn(`Không tìm thấy profile: "${profileName}"`);
    }

    return {
      directory: found ? found.directory : null,
      availableProfiles: profiles,
    };
  },
};

module.exports = ProfileService;
