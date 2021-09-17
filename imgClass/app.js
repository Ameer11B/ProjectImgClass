"use strict";
const express = require("express");
const app = express();
const request = require("request");
//const path = require("path");
const myCOS = require("ibm-cos-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
const cors = require("cors");
app.use(cors());
require("dotenv").config({
  silent: true
});
app.use(express.static(__dirname + '/public/index.html'));
app.use(express.static(__dirname + '/public/js'));
app.use(express.static(__dirname + '/public/images'))
app.use(express.static(__dirname + '/public/css'))
const port = process.env.PORT || 3000;

/*--------------server funcs-------------*/
function next(res,error) {
  if (error) {
    console.log(error);
    res.status(400).send(error.message);
  }
}

/**
 *Define Cloud OBject Storage client configuration
 *
 * @return {*} cosCLient
 */
 function getCosClient() {
   var config = {
    endpoint:"s3.eu-gb.cloud-object-storage.appdomain.cloud",
    apiKeyId:"gDntRtM6VRj7bNLdZyBdbIQ6y43yHw_mwISgxuZSDOne",
    ibmAuthEndpoint: "https://iam.cloud.ibm.com/identity/token",
    serviceInstanceId: "crn:v1:bluemix:public:cloud-object-storage:global:a/614f7d57771c4ed28785d0364bb5dfd9:a030a651-5987-49a6-a309-eca5458b3215::",
  };

  var cosClient = new myCOS.S3(config);
  return cosClient;
}

/**
 * Upload images to COS Bucket
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function uploadFilesToCOS(req, res, next) {
  var upload = multer({
    storage: multerS3({
      s3: getCosClient(),
      bucket: "ah-project",
      metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
      },
      key: function (req, file, cb) {
        cb(null, file.originalname);
      },
    }),
  }).array('files', 10);


  upload(req, res, function (err) {
    if (err) {
      console.log("ERROR");
      next(err);
    }
    if (req.files.length === 0) {
      console.log("Upload an image...");
      res.send("Upload an image...");
    } else if (req.files.length > 1) {
      console.log(
        "Successfully uploaded " + req.files.length + " images to Object Storage"
      );
      res.send(
        "Successfully uploaded " + req.files.length + " images to Object Storage"
      );
    } else {
      console.log(
        "Successfully uploaded " + req.files.length + " image to Object Storage"
      );
      res.send(
        "Successfully uploaded " + req.files.length + " image to Object Storage"
      );
    }
  });
}

/**
 *Get COS bucket contents (images)
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @param {*} prefix
 * @return {*} result dictionary
 */
async function getBucketContents(req, res, next, prefix){
  try {
    let cos = getCosClient();
    let bucketName = "ah-project";
    //console.log("AFTER BUCKET_NAME");
    var resultDict = {};
    var result;
    console.log(`Retrieving bucket contents from: ${bucketName}`);

    const data = await cos
      .listObjects({
        Bucket: bucketName,
      })
      .promise();
    if (data != null && data.Contents != null) {
      for (var i = 0; i < data.Contents.length; i++) {
        if(prefix === "annotations"){
          if(data.Contents[i].Key.split('/').length >= 2){
            var itemKey = data.Contents[i].Key;
            var itemSize = data.Contents[i].Size;
            console.log(`Item: ${itemKey} (${itemSize} bytes).`);
            result = await getItem(bucketName, itemKey, prefix);
            resultDict[itemKey] = result;
          }
        }else{
          if(data.Contents[i].Key.split('/').length < 2){
            var itemKey = data.Contents[i].Key;
          var itemSize = data.Contents[i].Size;
          console.log(`Item: ${itemKey} (${itemSize} bytes).`);
          result = await getItem(bucketName, itemKey, prefix);
          resultDict[itemKey] = result;
          }
        }
      }
      //res.send(resultDict);
      res.send({ data: resultDict });
    }
  } catch (e) {
    //console.log(e);
    console.error(`ERROR: ${e.code} - ${e.message}\n`);
    //return next(e.message);
    res.status(400).send(e.message);
  }
}
/**
 * Get each item in a COS Bucket
 *
 * @param {*} bucketName
 * @param {*} itemName
 * @param {*} prefix
 * @return {*} 
 */
async function getItem(bucketName, itemName, prefix) {
  let cos = getCosClient();
  console.log(`Retrieving item from bucket: ${bucketName}, key: ${itemName}`);
  try {
    const data = await cos
      .getObject({
        Bucket: bucketName,
        Key: itemName,
      })
      .promise();
    if (data != null) {
      if (prefix === "annotations") {
        console.log(data.body);
        return JSON.parse(data.Body);
      } else {
        return Buffer.from(data.Body).toString("base64");
      }
    }
  } catch (e) {
    console.error(`ERROR: ${e.code} - ${e.message}\n`);
  }
}

async function deleteItem(req, res, next, bucketName, itemName, prefix) {
  let cos = getCosClient();
  console.log(`Deleting item: ${itemName}`);
  try {
    await cos
      .deleteObject({
        Bucket: 'ah-project',
        Key: itemName,
      })
      .promise();
    console.log(`Item: ${itemName} deleted!`);
    res.send(`Item: ${itemName} deleted!`);
  } catch (e) {
    console.error(`ERROR: ${e.code} - ${e.message}\n`);
  }
}



/*---------------------------------------*/
/*
 * Default route for the web app
 */
app.get('/', function(req, res) {
  res.sendFile(__dirname + "/public/index.html");
  console.log("New connection received!");
});



app.get('/items', async(req, res) => {
  await getBucketContents(req, res, (err) => console.log("GOT ERROR: ", err), "images");
});

/*
 * Upload an image for Image classification
 */
app.post("/uploadimage", uploadFilesToCOS, function (req, res, next) {});

app.post("/classifyimage", async(req, res) => {
  await getBucketContents(req, res, (err) => console.log("GOT ERROR: ", err), "annotations");
});

app.delete("/image", async (req, res) => {
  console.log(req.query.filename);
  await deleteItem(req, res, next, null, req.query.filename, "images");
});

app.use((req, res, next) => {
  const error = new Error("Not found");
  error.status = 404;
  next(error);
});

app.use(function(error, req, res, next) {
  res.status(500).send(error.message);
});

app.listen(port, () => console.log(`App listening on port ${port}!`));