/* =========================================================
   硕丰科技 - 产品样图处理
   文件：assets/js/image-upload.js

   功能：
   1. 选择图片
   2. 自动压缩
   3. 自动转 WebP
   4. 上传到 Supabase Storage
   5. 删除 Storage 中的图片

   注意：
   需要 products.html 先创建好 Supabase Client：
   window.sb
========================================================= */


/* =========================================================
   图片处理参数
========================================================= */

const PRODUCT_IMAGE_CONFIG = {

  // 最大原始文件 10MB
  maxOriginalSize:
    10 * 1024 * 1024,

  // 最长边 1600px
  maxDimension:
    1600,

  // WebP 压缩质量
  quality:
    0.82,

  // Storage Bucket 名称
  bucket:
    "product-images",

  // 允许格式
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp"
  ]

};



/* =========================================================
   检查 Supabase Client
========================================================= */

function getSupabaseClient() {

  if (!window.sb) {

    throw new Error(
      "Supabase Client 尚未初始化。"
    );

  }

  return window.sb;

}



/* =========================================================
   生成随机文件名
========================================================= */

function createImageFileName() {

  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {

    return (
      window.crypto.randomUUID() +
      ".webp"
    );

  }


  return (
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2) +
    ".webp"
  );

}



/* =========================================================
   读取图片
========================================================= */

function loadImage(file) {

  return new Promise(
    function(resolve, reject) {

      const image =
        new Image();

      const objectURL =
        URL.createObjectURL(file);


      image.onload =
        function() {

          URL.revokeObjectURL(
            objectURL
          );

          resolve(image);

        };


      image.onerror =
        function() {

          URL.revokeObjectURL(
            objectURL
          );

          reject(
            new Error(
              "无法读取图片文件。"
            )
          );

        };


      image.src =
        objectURL;

    }
  );

}



/* =========================================================
   计算压缩后的尺寸
========================================================= */

function calculateImageSize(
  originalWidth,
  originalHeight
) {

  const maxDimension =
    PRODUCT_IMAGE_CONFIG.maxDimension;


  if (
    originalWidth <= maxDimension &&
    originalHeight <= maxDimension
  ) {

    return {
      width:
        originalWidth,

      height:
        originalHeight
    };

  }


  const ratio =
    Math.min(
      maxDimension /
        originalWidth,

      maxDimension /
        originalHeight
    );


  return {

    width:
      Math.round(
        originalWidth *
        ratio
      ),

    height:
      Math.round(
        originalHeight *
        ratio
      )

  };

}



/* =========================================================
   Canvas 转 Blob
========================================================= */

function canvasToBlob(
  canvas,
  type,
  quality
) {

  return new Promise(
    function(resolve, reject) {

      canvas.toBlob(
        function(blob) {

          if (!blob) {

            reject(
              new Error(
                "图片压缩失败。"
              )
            );

            return;

          }


          resolve(blob);

        },

        type,

        quality
      );

    }
  );

}



/* =========================================================
   压缩图片并转为 WebP
========================================================= */

async function compressProductImage(
  file
) {

  if (!file) {

    throw new Error(
      "没有选择图片。"
    );

  }


  if (
    !PRODUCT_IMAGE_CONFIG
      .allowedTypes
      .includes(file.type)
  ) {

    throw new Error(
      "仅支持 JPG、PNG、WEBP 图片。"
    );

  }


  if (
    file.size >
    PRODUCT_IMAGE_CONFIG
      .maxOriginalSize
  ) {

    throw new Error(
      "原始图片不能超过 10MB。"
    );

  }


  const image =
    await loadImage(file);


  const target =
    calculateImageSize(
      image.naturalWidth,
      image.naturalHeight
    );


  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width =
    target.width;

  canvas.height =
    target.height;


  const context =
    canvas.getContext(
      "2d"
    );


  if (!context) {

    throw new Error(
      "浏览器无法处理图片。"
    );

  }


  /*
    对透明 PNG 使用白色背景，
    避免转换 WebP 时出现异常背景。
  */

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    target.width,
    target.height
  );


  context.drawImage(
    image,
    0,
    0,
    target.width,
    target.height
  );


  const blob =
    await canvasToBlob(
      canvas,
      "image/webp",
      PRODUCT_IMAGE_CONFIG
        .quality
    );


  return {

    blob:
      blob,

    originalName:
      file.name,

    width:
      target.width,

    height:
      target.height,

    size:
      blob.size,

    mimeType:
      "image/webp"

  };

}



/* =========================================================
   上传产品样图
========================================================= */

async function uploadProductImage(
  productId,
  file
) {

  if (!productId) {

    throw new Error(
      "缺少产品 ID。"
    );

  }


  const sb =
    getSupabaseClient();


  /*
    第一步：
    压缩和转换
  */

  const processed =
    await compressProductImage(
      file
    );


  /*
    第二步：
    创建 Storage 路径

    格式：
    产品UUID/图片UUID.webp
  */

  const fileName =
    createImageFileName();


  const storagePath =
    productId +
    "/" +
    fileName;


  /*
    第三步：
    上传到 Storage
  */

  const uploadResult =
    await sb
      .storage
      .from(
        PRODUCT_IMAGE_CONFIG
          .bucket
      )
      .upload(
        storagePath,
        processed.blob,
        {
          contentType:
            "image/webp",

          upsert:
            false,

          cacheControl:
            "3600"
        }
      );


  if (
    uploadResult.error
  ) {

    throw uploadResult.error;

  }


  /*
    第四步：
    返回给 products.html

    注意：
    数据库 product_images
    插入记录的动作，
    我建议放在 products.html，
    因为 products.html 知道当前登录用户、
    当前产品和页面状态。
  */

  return {

    storagePath:
      storagePath,

    originalName:
      processed.originalName,

    mimeType:
      processed.mimeType,

    fileSize:
      processed.size,

    width:
      processed.width,

    height:
      processed.height

  };

}



/* =========================================================
   删除 Storage 中的产品样图
========================================================= */

async function deleteProductImageFromStorage(
  storagePath
) {

  if (!storagePath) {

    throw new Error(
      "缺少图片路径。"
    );

  }


  const sb =
    getSupabaseClient();


  const result =
    await sb
      .storage
      .from(
        PRODUCT_IMAGE_CONFIG
          .bucket
      )
      .remove([
        storagePath
      ]);


  if (result.error) {

    throw result.error;

  }


  return true;

}



/* =========================================================
   获取 Private Bucket 临时查看地址
========================================================= */

async function createProductImageSignedUrl(
  storagePath,
  expiresInSeconds = 3600
) {

  if (!storagePath) {

    throw new Error(
      "缺少图片路径。"
    );

  }


  const sb =
    getSupabaseClient();


  const result =
    await sb
      .storage
      .from(
        PRODUCT_IMAGE_CONFIG
          .bucket
      )
      .createSignedUrl(
        storagePath,
        expiresInSeconds
      );


  if (result.error) {

    throw result.error;

  }


  return (
    result.data
      .signedUrl
  );

}



/* =========================================================
   将方法公开给 products.html 使用
========================================================= */

window.ProductImageService = {

  config:
    PRODUCT_IMAGE_CONFIG,

  compress:
    compressProductImage,

  upload:
    uploadProductImage,

  removeFromStorage:
    deleteProductImageFromStorage,

  createSignedUrl:
    createProductImageSignedUrl

};
