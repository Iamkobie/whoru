const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to file
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<object>} Upload result
 */
const uploadImage = async (filePath, folder = 'whoru') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'image',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

/**
 * Upload video to Cloudinary
 * @param {string} filePath - Path to file
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<object>} Upload result
 */
const uploadVideo = async (filePath, folder = 'whoru/videos') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'video',
      transformation: [
        { width: 1280, height: 720, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary video upload failed: ${error.message}`);
  }
};

/**
 * Upload audio to Cloudinary
 * @param {string} filePath - Path to file
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<object>} Upload result
 */
const uploadAudio = async (filePath, folder = 'whoru/audio') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'video' // Cloudinary uses 'video' for audio too
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary audio upload failed: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type (image, video, raw)
 * @returns {Promise<object>} Delete result
 */
const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
};

module.exports = {
  cloudinary,
  uploadImage,
  uploadVideo,
  uploadAudio,
  deleteFile
};
