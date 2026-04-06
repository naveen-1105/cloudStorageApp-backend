import { getSignedUrl } from "@aws-sdk/cloudfront-signer"
import {readFile} from "fs/promises";
import dotenv from "dotenv"
dotenv.config()

const privateKey=process.env.private_key;
const keyPairId = "K3UGAO160PEHTC"
const dateLessThan = new Date(Date.now() + 1000*60*60).toString()
const distributionName = `https://dddjglpoywiqh.cloudfront.net`

export const createCloudFrontGetSignedurl = ({key,download = false,filename}) => {
    console.log("key: ", key);
    const url = `${distributionName}/uploads/${key}?response-content-disposition=${encodeURIComponent(`${download == true ? 'attachment' : 'inline'};filename=${filename}`)}`;
    const signedUrl = getSignedUrl({
    url,
    keyPairId,
    dateLessThan,
    privateKey
})
return signedUrl
}