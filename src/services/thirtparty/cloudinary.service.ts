// src/services/thirtparty/cloudinary.service.ts
import { v2 as cloudinary } from 'cloudinary';

export class CloudinaryService {
  private static instance: CloudinaryService;

  private constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }

  public static getInstance(): CloudinaryService {
    if (!CloudinaryService.instance) {
      CloudinaryService.instance = new CloudinaryService();
    }
    return CloudinaryService.instance;
  }

  // ✅ CORREGIR: Cambiar nombre del método
  async uploadCsv(csvData: string, filename?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: filename || `data_${Date.now()}`,
          format: 'csv'
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve((result as { secure_url: string }).secure_url);
          }
        }
      ).end(csvData);
    });
  }

  // Mantener el método original también por compatibilidad
  async uploadCSV(csvData: string): Promise<string> {
    return this.uploadCsv(csvData);
  }
}