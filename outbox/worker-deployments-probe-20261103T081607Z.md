# Worker deployment history from Cloudflare's API, read 2026-11-03T08:16:08Z

Read-only. Two GETs per script. The token and the account id are not printed. Author emails are removed from the raw answers.
Account: derived from the token (GET /accounts returned exactly one account).

## `field-relay-nba`

**deployments**: 10 (newest first as the API returns them)

| created (UTC) | deployment id | source | versions (traffic %) | annotations |
|---|---|---|---|---|
| 2026-11-03T01:03:04.657296Z | `96127882-4aa3-4e98-bc4b-a7e1ac76c54f` | wrangler | `ad8f5cc7-54f6-4c7e-8381-71de0be92967` 100 | {"workers/triggered_by": "deployment"} |
| 2026-11-03T01:02:59.832463Z | `3ee78005-706e-4d46-8efa-9799c0f52d53` | wrangler | `604f4f8c-6f45-49df-890e-47fefd3299bb` 100 | {"workers/message": "Automatic deployment on upload.", "workers/triggered_by": "upload"} |
| 2026-11-01T17:25:37.876881Z | `7d510084-7eab-40b7-a282-c825e3b64d8b` | wrangler | `daf274f8-3555-48ba-8015-d8b53aab0323` 100 | {"workers/triggered_by": "deployment"} |
| 2026-11-01T17:25:33.596824Z | `9d57ba6d-e092-468f-80a6-05d541ec5de6` | wrangler | `a60a8277-e421-4b17-bb8d-b3b62d5665ec` 100 | {"workers/message": "Automatic deployment on upload.", "workers/triggered_by": "upload"} |
| 2026-10-30T21:40:36.277867Z | `e26c8786-b334-4374-9a37-48f24ffcf9d6` | wrangler | `c91c0747-5da4-44b8-90e6-3e1291d34ebc` 100 | {"workers/triggered_by": "deployment"} |
| 2026-10-30T21:40:32.233574Z | `3cc8ee4f-0fa8-4043-affe-6654c8e46995` | wrangler | `67a543f6-1a1f-4631-b762-fccd89262561` 100 | {"workers/message": "Automatic deployment on upload.", "workers/triggered_by": "upload"} |
| 2026-10-30T17:27:28.125477Z | `308777b8-d2e8-4ee2-ba54-3b33d944b5a2` | wrangler | `42b46f92-0e5d-4db8-9ab8-b627f901d33e` 100 | {"workers/triggered_by": "deployment"} |
| 2026-10-30T17:27:23.036383Z | `58e4fc7a-1293-470d-9b5b-6b4b53c0711c` | wrangler | `3ef4e3d0-330e-43cb-8bf9-121941327dd0` 100 | {"workers/message": "Automatic deployment on upload.", "workers/triggered_by": "upload"} |
| 2026-10-30T17:17:39.735724Z | `c0b5bf41-2bf1-4750-aa83-ea9010134d6b` | wrangler | `9106aefb-00b7-499e-a8fd-32cc90dc2444` 100 | {"workers/triggered_by": "deployment"} |
| 2026-10-30T17:17:35.025237Z | `96d74d24-3df2-479b-9cc9-e7f570ede6c5` | wrangler | `6f417ee9-0bfc-43c6-97ab-ab0ae335475e` 100 | {"workers/message": "Automatic deployment on upload.", "workers/triggered_by": "upload"} |

<details><summary>raw deployments answer</summary>

```json
{
 "result": {
  "deployments": [
   {
    "id": "96127882-4aa3-4e98-bc4b-a7e1ac76c54f",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/triggered_by": "deployment"
    },
    "versions": [
     {
      "version_id": "ad8f5cc7-54f6-4c7e-8381-71de0be92967",
      "percentage": 100
     }
    ],
    "created_on": "2026-11-03T01:03:04.657296Z"
   },
   {
    "id": "3ee78005-706e-4d46-8efa-9799c0f52d53",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/message": "Automatic deployment on upload.",
     "workers/triggered_by": "upload"
    },
    "versions": [
     {
      "version_id": "604f4f8c-6f45-49df-890e-47fefd3299bb",
      "percentage": 100
     }
    ],
    "created_on": "2026-11-03T01:02:59.832463Z"
   },
   {
    "id": "7d510084-7eab-40b7-a282-c825e3b64d8b",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/triggered_by": "deployment"
    },
    "versions": [
     {
      "version_id": "daf274f8-3555-48ba-8015-d8b53aab0323",
      "percentage": 100
     }
    ],
    "created_on": "2026-11-01T17:25:37.876881Z"
   },
   {
    "id": "9d57ba6d-e092-468f-80a6-05d541ec5de6",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/message": "Automatic deployment on upload.",
     "workers/triggered_by": "upload"
    },
    "versions": [
     {
      "version_id": "a60a8277-e421-4b17-bb8d-b3b62d5665ec",
      "percentage": 100
     }
    ],
    "created_on": "2026-11-01T17:25:33.596824Z"
   },
   {
    "id": "e26c8786-b334-4374-9a37-48f24ffcf9d6",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/triggered_by": "deployment"
    },
    "versions": [
     {
      "version_id": "c91c0747-5da4-44b8-90e6-3e1291d34ebc",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T21:40:36.277867Z"
   },
   {
    "id": "3cc8ee4f-0fa8-4043-affe-6654c8e46995",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/message": "Automatic deployment on upload.",
     "workers/triggered_by": "upload"
    },
    "versions": [
     {
      "version_id": "67a543f6-1a1f-4631-b762-fccd89262561",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T21:40:32.233574Z"
   },
   {
    "id": "308777b8-d2e8-4ee2-ba54-3b33d944b5a2",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/triggered_by": "deployment"
    },
    "versions": [
     {
      "version_id": "42b46f92-0e5d-4db8-9ab8-b627f901d33e",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T17:27:28.125477Z"
   },
   {
    "id": "58e4fc7a-1293-470d-9b5b-6b4b53c0711c",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/message": "Automatic deployment on upload.",
     "workers/triggered_by": "upload"
    },
    "versions": [
     {
      "version_id": "3ef4e3d0-330e-43cb-8bf9-121941327dd0",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T17:27:23.036383Z"
   },
   {
    "id": "c0b5bf41-2bf1-4750-aa83-ea9010134d6b",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/triggered_by": "deployment"
    },
    "versions": [
     {
      "version_id": "9106aefb-00b7-499e-a8fd-32cc90dc2444",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T17:17:39.735724Z"
   },
   {
    "id": "96d74d24-3df2-479b-9cc9-e7f570ede6c5",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "<removed>",
    "annotations": {
     "workers/message": "Automatic deployment on upload.",
     "workers/triggered_by": "upload"
    },
    "versions": [
     {
      "version_id": "6f417ee9-0bfc-43c6-97ab-ab0ae335475e",
      "percentage": 100
     }
    ],
    "created_on": "2026-10-30T17:17:35.025237Z"
   }
  ]
 },
 "success": true,
 "errors": [],
 "messages": [],
 "result_info": {
  "page": 1,
  "per_page": 10,
  "count": 10,
  "total_count": 2030,
  "total_pages": 203
 }
}
```
</details>

**versions**: 50

| created (UTC) | number | version id | source |
|---|---|---|---|
| 2026-11-03T01:03:03.973112Z | 2030 | `ad8f5cc7-54f6-4c7e-8381-71de0be92967` | wrangler |
| 2026-11-03T01:02:59.832463Z | 2029 | `604f4f8c-6f45-49df-890e-47fefd3299bb` | wrangler |
| 2026-11-01T17:25:36.976276Z | 2028 | `daf274f8-3555-48ba-8015-d8b53aab0323` | wrangler |
| 2026-11-01T17:25:33.596824Z | 2027 | `a60a8277-e421-4b17-bb8d-b3b62d5665ec` | wrangler |
| 2026-10-30T21:40:35.60945Z | 2026 | `c91c0747-5da4-44b8-90e6-3e1291d34ebc` | wrangler |
| 2026-10-30T21:40:32.233574Z | 2025 | `67a543f6-1a1f-4631-b762-fccd89262561` | wrangler |
| 2026-10-30T17:27:27.355345Z | 2024 | `42b46f92-0e5d-4db8-9ab8-b627f901d33e` | wrangler |
| 2026-10-30T17:27:23.036383Z | 2023 | `3ef4e3d0-330e-43cb-8bf9-121941327dd0` | wrangler |
| 2026-10-30T17:17:39.068894Z | 2022 | `9106aefb-00b7-499e-a8fd-32cc90dc2444` | wrangler |
| 2026-10-30T17:17:35.025237Z | 2021 | `6f417ee9-0bfc-43c6-97ab-ab0ae335475e` | wrangler |
| 2026-10-30T16:59:23.916896Z | 2020 | `c36a127c-ca85-45a4-9a49-5cebc05be26c` | wrangler |
| 2026-10-30T16:59:20.526959Z | 2019 | `2e82f66b-b827-4004-ae09-16d8c2460d0d` | wrangler |
| 2026-10-30T16:28:24.37222Z | 2018 | `0de0d4a1-09ad-4cf2-981a-deb1a7c9faaf` | wrangler |
| 2026-10-30T16:28:20.803732Z | 2017 | `60942a25-a35c-48d8-b6b2-be6522bf5c0a` | wrangler |
| 2026-10-30T12:21:34.791569Z | 2016 | `2b9aa701-000d-4af0-a2ad-3a4124563657` | wrangler |
| 2026-10-30T12:21:31.261719Z | 2015 | `2ee19e5b-c80a-4a6d-8439-03594f512054` | wrangler |
| 2026-10-30T00:32:29.743245Z | 2014 | `c05e59a1-377d-45b8-b003-5767b2837e20` | wrangler |
| 2026-10-30T00:32:26.693262Z | 2013 | `e3fda56d-0057-4b1f-9f7a-c18fd7ab8bf1` | wrangler |
| 2026-10-30T00:11:19.798977Z | 2012 | `8b50d805-f3c5-49eb-88ea-599106d06ced` | wrangler |
| 2026-10-30T00:11:16.221873Z | 2011 | `0820c9ff-61ba-468f-8cc2-630c0e4d1875` | wrangler |
| 2026-10-29T23:39:21.199024Z | 2010 | `50c66577-4efb-4898-b9ea-192a4fff4842` | wrangler |
| 2026-10-29T23:39:18.260832Z | 2009 | `2a1a5125-7752-43f0-93a6-1a966892ea30` | wrangler |
| 2026-10-29T18:35:06.791598Z | 2008 | `7b125eba-7106-4a4b-86a5-7cec6e9e8748` | wrangler |
| 2026-10-29T18:34:59.678158Z | 2007 | `a20e9df9-27d9-4e61-b14c-cc5355859da7` | wrangler |
| 2026-10-29T17:28:03.337697Z | 2006 | `13d5ef5e-4306-4a1b-8fc0-ab67d81f3fe4` | wrangler |
| 2026-10-29T17:27:59.867938Z | 2005 | `f5872dd5-71dd-4826-a581-0892db2dbf0a` | wrangler |
| 2026-10-29T11:13:09.134849Z | 2004 | `6c59b57d-73c6-4a82-93a8-cfd56eee325e` | wrangler |
| 2026-10-29T11:13:05.517668Z | 2003 | `d900c89f-9a70-4c1f-90f2-1d0b26efcc5f` | wrangler |
| 2026-10-29T03:31:42.81107Z | 2002 | `de09c0c6-ae46-40f1-96fe-95279f78b578` | wrangler |
| 2026-10-29T03:31:39.48646Z | 2001 | `f8c79ad7-6a77-45d7-8b83-08245786c059` | wrangler |
| 2026-10-28T22:12:57.214576Z | 2000 | `0a839b11-d573-4f6f-8da5-02a23bdc12c5` | wrangler |
| 2026-10-28T22:12:53.868233Z | 1999 | `75cf39d6-d2d1-432f-b343-de8765b0bd03` | wrangler |
| 2026-10-28T18:50:58.159098Z | 1998 | `28d64c05-bf08-4466-8dde-000b05848b84` | wrangler |
| 2026-10-28T18:50:53.303062Z | 1997 | `03a82a53-a45f-4b41-953c-e7828c5fa3f8` | wrangler |
| 2026-10-28T18:28:11.764392Z | 1996 | `f20b7df6-54b7-4845-bd4f-8009cffc275c` | wrangler |
| 2026-10-28T18:28:08.272405Z | 1995 | `a4d4877d-27f7-4480-92ec-8c0a9bf8dcab` | wrangler |
| 2026-10-28T17:05:53.486957Z | 1994 | `ce41ee44-abbe-4f03-b2c1-0f885c9695a2` | wrangler |
| 2026-10-28T17:05:49.757965Z | 1993 | `9a7597be-84e0-4c31-b951-9a18651fcf5e` | wrangler |
| 2026-10-28T04:20:06.911794Z | 1992 | `095feb19-6928-4f69-b3e1-18b5d794fc05` | wrangler |
| 2026-10-28T04:20:01.54584Z | 1991 | `accf9e4b-2390-4ec5-b239-8f8744796403` | wrangler |
| 2026-10-28T03:09:40.733351Z | 1990 | `df4bf5c9-a52c-415f-9075-0def6b4df2cb` | wrangler |
| 2026-10-28T03:09:37.279713Z | 1989 | `9ce7cdf9-ddf3-4b0d-bee5-b83b4c967313` | wrangler |
| 2026-10-28T00:16:25.605312Z | 1988 | `1108c63b-7292-46b2-b07b-3876af500675` | wrangler |
| 2026-10-28T00:16:22.434608Z | 1987 | `7f33cba6-7390-4193-a8bb-4d140b2e3cab` | wrangler |
| 2026-10-25T14:36:44.377077Z | 1986 | `381d5b71-c11c-4844-bd8f-2b30cccb666e` | wrangler |
| 2026-10-25T14:36:40.979214Z | 1985 | `c24c3f3d-b3b3-4d40-ad88-8e433454a2f2` | wrangler |
| 2026-10-24T14:27:18.327021Z | 1984 | `d155195a-d063-4c2f-9333-dc40f6546f11` | wrangler |
| 2026-10-24T14:27:14.758645Z | 1983 | `0611ed36-3ae8-4af1-8e96-4ca1558c899e` | wrangler |
| 2026-10-23T23:06:00.232022Z | 1982 | `8f85345c-25ed-4fa2-a4df-4fde70f76d59` | wrangler |
| 2026-10-23T23:05:56.705001Z | 1981 | `0bb327cd-c950-4873-b7a8-bf6b7d4fb9a3` | wrangler |

<details><summary>raw versions answer</summary>

```json
{
 "result": {
  "items": [
   {
    "id": "ad8f5cc7-54f6-4c7e-8381-71de0be92967",
    "number": 2030,
    "metadata": {
     "created_on": "2026-11-03T01:03:03.973112Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "604f4f8c-6f45-49df-890e-47fefd3299bb",
    "number": 2029,
    "metadata": {
     "created_on": "2026-11-03T01:02:59.832463Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "daf274f8-3555-48ba-8015-d8b53aab0323",
    "number": 2028,
    "metadata": {
     "created_on": "2026-11-01T17:25:36.976276Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "a60a8277-e421-4b17-bb8d-b3b62d5665ec",
    "number": 2027,
    "metadata": {
     "created_on": "2026-11-01T17:25:33.596824Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "c91c0747-5da4-44b8-90e6-3e1291d34ebc",
    "number": 2026,
    "metadata": {
     "created_on": "2026-10-30T21:40:35.60945Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "67a543f6-1a1f-4631-b762-fccd89262561",
    "number": 2025,
    "metadata": {
     "created_on": "2026-10-30T21:40:32.233574Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "42b46f92-0e5d-4db8-9ab8-b627f901d33e",
    "number": 2024,
    "metadata": {
     "created_on": "2026-10-30T17:27:27.355345Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "3ef4e3d0-330e-43cb-8bf9-121941327dd0",
    "number": 2023,
    "metadata": {
     "created_on": "2026-10-30T17:27:23.036383Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "9106aefb-00b7-499e-a8fd-32cc90dc2444",
    "number": 2022,
    "metadata": {
     "created_on": "2026-10-30T17:17:39.068894Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "6f417ee9-0bfc-43c6-97ab-ab0ae335475e",
    "number": 2021,
    "metadata": {
     "created_on": "2026-10-30T17:17:35.025237Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "c36a127c-ca85-45a4-9a49-5cebc05be26c",
    "number": 2020,
    "metadata": {
     "created_on": "2026-10-30T16:59:23.916896Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "2e82f66b-b827-4004-ae09-16d8c2460d0d",
    "number": 2019,
    "metadata": {
     "created_on": "2026-10-30T16:59:20.526959Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "0de0d4a1-09ad-4cf2-981a-deb1a7c9faaf",
    "number": 2018,
    "metadata": {
     "created_on": "2026-10-30T16:28:24.37222Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "60942a25-a35c-48d8-b6b2-be6522bf5c0a",
    "number": 2017,
    "metadata": {
     "created_on": "2026-10-30T16:28:20.803732Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "2b9aa701-000d-4af0-a2ad-3a4124563657",
    "number": 2016,
    "metadata": {
     "created_on": "2026-10-30T12:21:34.791569Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "2ee19e5b-c80a-4a6d-8439-03594f512054",
    "number": 2015,
    "metadata": {
     "created_on": "2026-10-30T12:21:31.261719Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "c05e59a1-377d-45b8-b003-5767b2837e20",
    "number": 2014,
    "metadata": {
     "created_on": "2026-10-30T00:32:29.743245Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "e3fda56d-0057-4b1f-9f7a-c18fd7ab8bf1",
    "number": 2013,
    "metadata": {
     "created_on": "2026-10-30T00:32:26.693262Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "8b50d805-f3c5-49eb-88ea-599106d06ced",
    "number": 2012,
    "metadata": {
     "created_on": "2026-10-30T00:11:19.798977Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "0820c9ff-61ba-468f-8cc2-630c0e4d1875",
    "number": 2011,
    "metadata": {
     "created_on": "2026-10-30T00:11:16.221873Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "50c66577-4efb-4898-b9ea-192a4fff4842",
    "number": 2010,
    "metadata": {
     "created_on": "2026-10-29T23:39:21.199024Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "2a1a5125-7752-43f0-93a6-1a966892ea30",
    "number": 2009,
    "metadata": {
     "created_on": "2026-10-29T23:39:18.260832Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "7b125eba-7106-4a4b-86a5-7cec6e9e8748",
    "number": 2008,
    "metadata": {
     "created_on": "2026-10-29T18:35:06.791598Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "a20e9df9-27d9-4e61-b14c-cc5355859da7",
    "number": 2007,
    "metadata": {
     "created_on": "2026-10-29T18:34:59.678158Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "13d5ef5e-4306-4a1b-8fc0-ab67d81f3fe4",
    "number": 2006,
    "metadata": {
     "created_on": "2026-10-29T17:28:03.337697Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "f5872dd5-71dd-4826-a581-0892db2dbf0a",
    "number": 2005,
    "metadata": {
     "created_on": "2026-10-29T17:27:59.867938Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "6c59b57d-73c6-4a82-93a8-cfd56eee325e",
    "number": 2004,
    "metadata": {
     "created_on": "2026-10-29T11:13:09.134849Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "d900c89f-9a70-4c1f-90f2-1d0b26efcc5f",
    "number": 2003,
    "metadata": {
     "created_on": "2026-10-29T11:13:05.517668Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "de09c0c6-ae46-40f1-96fe-95279f78b578",
    "number": 2002,
    "metadata": {
     "created_on": "2026-10-29T03:31:42.81107Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "f8c79ad7-6a77-45d7-8b83-08245786c059",
    "number": 2001,
    "metadata": {
     "created_on": "2026-10-29T03:31:39.48646Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "0a839b11-d573-4f6f-8da5-02a23bdc12c5",
    "number": 2000,
    "metadata": {
     "created_on": "2026-10-28T22:12:57.214576Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "version_upload"
    }
   },
   {
    "id": "75cf39d6-d2d1-432f-b343-de8765b0bd03",
    "number": 1999,
    "metadata": {
     "created_on": "2026-10-28T22:12:53.868233Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "has_preview": false
    },
    "annotations": {
     "workers/triggered_by": "upload"
    }
   },
   {
    "id": "28d64c05-bf08-4466-8dde-000b05848b84",
    "number": 1998,
    "metadata": {
     "created_on": "2026-10-28T18:50:58.159098Z",
     "source": "wrangler",
     "author_id": "5b56c98ca50c16d67656ced41db552b3",
     "author_email": "<removed>",
     "
```
</details>

### Version detail for `field-relay-nba`

| version id | number | created (UTC) | script etag | handlers | compatibility date | bindings (count, sha256 of the canonical list) |
|---|---|---|---|---|---|---|
| `ad8f5cc7-54f6-4c7e-8381-71de0be92967` | 2030 | 2026-11-03T01:03:03.973112Z | `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |
| `604f4f8c-6f45-49df-890e-47fefd3299bb` | 2029 | 2026-11-03T01:02:59.832463Z | `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |
| `daf274f8-3555-48ba-8015-d8b53aab0323` | 2028 | 2026-11-01T17:25:36.976276Z | `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |
| `a60a8277-e421-4b17-bb8d-b3b62d5665ec` | 2027 | 2026-11-01T17:25:33.596824Z | `19ac8ddcda02a1a60607b45a0f5647ba3b9f8d86a40a1a6c85f63a7f21b5e3ef` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |
| `c91c0747-5da4-44b8-90e6-3e1291d34ebc` | 2026 | 2026-10-30T21:40:35.60945Z | `19ac8ddcda02a1a60607b45a0f5647ba3b9f8d86a40a1a6c85f63a7f21b5e3ef` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |
| `67a543f6-1a1f-4631-b762-fccd89262561` | 2025 | 2026-10-30T21:40:32.233574Z | `52356d9313f295eb934738c76746df1262fbb24c2a551f515cfd1c4db22df2d6` | scheduled, fetch, _fetch, queue | 2026-06-22 | 38, 4e3f3cbce931a706 |

**etag comparison: the etags DIFFER:** `ad8f5cc7` = `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0`; `604f4f8c` = `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0`; `daf274f8` = `be651ac123a6ed661a8aee6ffb1aa80e8024df10596fb253977e5ea8d16779d0`; `a60a8277` = `19ac8ddcda02a1a60607b45a0f5647ba3b9f8d86a40a1a6c85f63a7f21b5e3ef`; `c91c0747` = `19ac8ddcda02a1a60607b45a0f5647ba3b9f8d86a40a1a6c85f63a7f21b5e3ef`; `67a543f6` = `52356d9313f295eb934738c76746df1262fbb24c2a551f515cfd1c4db22df2d6`

- shape: `ad8f5cc7` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']
- shape: `604f4f8c` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']
- shape: `daf274f8` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']
- shape: `a60a8277` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']
- shape: `c91c0747` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']
- shape: `67a543f6` result keys ['annotations', 'id', 'metadata', 'number', 'resources']; resources keys ['bindings', 'script', 'script_runtime']; resources.script keys ['etag', 'handlers', 'last_deployed_from', 'named_handlers']

