import './String.extensions';

const PROPERTY_KEY_STEAM_API_KEY: string = 'STEAM_API_KEY';
const PROPERTY_KEY_STEAM_ID: string = 'STEAM_ID';
const PROPERTY_KEY_TRELLO_API_KEY: string = 'TRELLO_API_KEY'
const PROPERTY_KEY_TRELLO_TOKEN: string = 'TRELLO_TOKEN';
const PROPERTY_KEY_SLACK_WEBHOOK_ENDPOINT: string = 'SLACK_WEBHOOK_ENDPOINT';
const FORMAT_STEAM_ENDPOINT_GET_OWNED_GAMES: string = 'http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?include_appinfo=true&include_played_free_games=true&key={0}&steamid={1}';
const FORMAT_STEAM_ENDPOINT_GET_PLAYER_ACHIEVEMENTS: string = 'http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key={0}&steamid={1}&appid={2}';
const FORMAT_STEAM_ENDPOINT_GET_PLAYER_WISHLIST: string = 'https://store.steampowered.com/wishlist/profiles/{0}/wishlistdata';
const FORMAT_STEAM_IMAGE_LOGO_URL: string = 'http://media.steampowered.com/steamcommunity/public/images/apps/{0}/{1}.jpg';
const FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST: string = 'https://api.trello.com/1/lists/{0}/archiveAllCards?key={1}&token={2}';
const FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD: string = 'https://api.trello.com/1/cards?key={0}&token={1}&idList={2}&desc={3}&name={4}&urlSource={5}';
const LIST_ID_STACKING: string = '604ed2027599ae2d423ec526';
const LIST_ID_PENDING: string = '604ebe8213443e361da34fc1';
const LIST_ID_PLAYING: string = '604ea6be71f9ad1d1ab2a75f';
const LIST_ID_PLAYED: string = '604ea6c355a39c738ccda7b3';
const LIST_ID_WANNA_PLAY: string = '604ea6cab083aa0be93b88ce';

var properties: GoogleAppsScript.Properties.Properties = PropertiesService.getScriptProperties();

function _daily(): void {
    console.time('----- _daily -----');

    try {
        var steamKey: string = properties.getProperty(PROPERTY_KEY_STEAM_API_KEY);
        var steamId: string = properties.getProperty(PROPERTY_KEY_STEAM_ID);
        var trelloKey: string = properties.getProperty(PROPERTY_KEY_TRELLO_API_KEY);
        var trelloToken: string = properties.getProperty(PROPERTY_KEY_TRELLO_TOKEN);

        var games: Game[] = getOwnedGames(steamKey, steamId);
        games = markCompletedGames(steamKey, steamId, games);
        var wishList: Game[] = getWishList(steamId);
        archiveAllCards(trelloKey, trelloToken);
        createNewCards(trelloKey, trelloToken, games);
        createNewCardsOnWannaPlay(trelloKey, trelloToken, wishList);
    } catch (e) {
        console.error(e);
        var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
            method: 'post',
            payload: JSON.stringify({ 'username': 'gamers-library-on-trello', 'text': 'Trelloのゲームライブラリ更新処理中にエラーが発生しました。<https://script.google.com/home/projects/11XOAuRf1PWdHf9IdMjcbmGVWcr0MwvRVHa3SOUgJ6sF5OiN9-EkPNhBh/executions|[ログ]>\nERROR=>' + e.message }),
            muteHttpExceptions: true
        };
        callExternalAPI(properties.getProperty(PROPERTY_KEY_SLACK_WEBHOOK_ENDPOINT), options);
    }

    console.timeEnd('----- _daily -----');
}

function getOwnedGames(key: string, id: string): Game[] {
    console.time('----- getOwnedGames -----');

    var url: string = FORMAT_STEAM_ENDPOINT_GET_OWNED_GAMES.format(key, id);
    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'get'
    };
    var response: GoogleAppsScript.URL_Fetch.HTTPResponse = callExternalAPI(url, options);
    var rawGames: any[] = JSON.parse(response.getContentText()).response.games;
    var games: Game[] = [];
    for (var i: number = 0; i < rawGames.length; i++) {
        var game: Game = new Game(rawGames[i].appid, rawGames[i].name, rawGames[i].playtime_forever, rawGames[i].img_logo_url);
        if (typeof rawGames[i].playtime_2weeks != 'undefined') {
            game.isRecentlyPlayed = true;
        }

        games.push(game);
    }

    console.timeEnd('----- getOwnedGames -----');
    return games;
}

function markCompletedGames(key: string, id: string, games: Game[]): Game[] {
    console.time('----- markCompletedGames -----');

    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'get',
        muteHttpExceptions: true
    };
    for (var i: number = 0; i < games.length; i++) {
        var url: string = FORMAT_STEAM_ENDPOINT_GET_PLAYER_ACHIEVEMENTS.format(key, id, games[i].appId);
        var response: GoogleAppsScript.URL_Fetch.HTTPResponse = callExternalAPI(url, options);
        var achievements: any[] = JSON.parse(response.getContentText()).playerstats.achievements;
        if (achievements) {
            for (var j: number = 0; j < achievements.length; j++) {
                if (achievements[j].achieved == 1) {
                    games[i].isCompleted = true;
                    continue;
                } else {
                    games[i].isCompleted = false;
                    break;
                }
            }
        }
    }

    console.timeEnd('----- markCompletedGames -----');
    return games;
}

function getWishList(id: string): Game[] {
    console.time('----- getWishList -----');

    var url: string = FORMAT_STEAM_ENDPOINT_GET_PLAYER_WISHLIST.format(id);
    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'get'
    };
    var response: GoogleAppsScript.URL_Fetch.HTTPResponse = callExternalAPI(url, options);
    var rawGames: any = JSON.parse(response.getContentText());
    var keys: string[] = Object.keys(rawGames);
    var games: Game[] = [];
    for (var i: number = 0; i < keys.length; i++) {
        var game: Game = new Game(keys[i], rawGames[keys[i]].name, 0, "DUMMY");
        game.logoUrl = rawGames[keys[i]].capsule;
        games.push(game);
    }

    console.timeEnd('----- getWishList -----');
    return games;
}

function archiveAllCards(key: string, token: string): void {
    console.time('----- archiveAllCards -----');

    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post'
    };

    var url: string = FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST.format(LIST_ID_STACKING, key, token);
    callExternalAPI(url, options);

    var url: string = FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST.format(LIST_ID_PENDING, key, token);
    callExternalAPI(url, options);

    var url: string = FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST.format(LIST_ID_PLAYING, key, token);
    callExternalAPI(url, options);

    var url: string = FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST.format(LIST_ID_PLAYED, key, token);
    callExternalAPI(url, options);

    var url: string = FORMAT_TRELLO_ENDPOINT_ARCHIVE_ALL_CARD_ON_LIST.format(LIST_ID_WANNA_PLAY, key, token);
    callExternalAPI(url, options);

    console.timeEnd('----- archiveAllCards -----');
}

function createNewCards(key: string, token: string, games: Game[]): void {
    console.time('----- createNewCards -----');

    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post'
    };

    for (var i: number = 0; i < games.length; i++) {
        if (games[i].playtime == 0) {
            var url: string = FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD.format(key, token, LIST_ID_STACKING, games[i].appId, encodeURIComponent(games[i].name), games[i].logoUrl);
            callExternalAPI(url, options);
            continue;
        }

        if (games[i].isRecentlyPlayed) {
            var url: string = FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD.format(key, token, LIST_ID_PLAYING, games[i].appId, encodeURIComponent(games[i].name), games[i].logoUrl);
            callExternalAPI(url, options);
            continue;
        }

        if (games[i].isCompleted) {
            var url: string = FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD.format(key, token, LIST_ID_PLAYED, games[i].appId, encodeURIComponent(games[i].name), games[i].logoUrl);
            callExternalAPI(url, options);
            continue;
        }

        var url: string = FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD.format(key, token, LIST_ID_PENDING, games[i].appId, encodeURIComponent(games[i].name), games[i].logoUrl);
        callExternalAPI(url, options);
    }

    console.timeEnd('----- createNewCards -----');
}

function createNewCardsOnWannaPlay(key: string, token: string, games: Game[]): void {
    console.time('----- createNewCardsOnWannaPlay -----');

    var options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post'
    };

    for (var i: number = 0; i < games.length; i++) {
        var url: string = FORMAT_TRELLO_ENDPOINT_CREATE_NEW_CARD.format(key, token, LIST_ID_WANNA_PLAY, games[i].appId, encodeURIComponent(games[i].name), games[i].logoUrl);
        callExternalAPI(url, options);
    }

    console.timeEnd('----- createNewCardsOnWannaPlay -----');
}

function callExternalAPI(endpoint: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): GoogleAppsScript.URL_Fetch.HTTPResponse {
    console.time('----- callExternalAPI ' + endpoint + ' -----');

    var response: GoogleAppsScript.URL_Fetch.HTTPResponse = UrlFetchApp.fetch(endpoint, options);

    console.timeEnd('----- callExternalAPI ' + endpoint + ' -----');
    return response;
}

class Game {
    constructor(appId: string, name: string, playtime: number, logoHash: string) {
        this.appId = appId;
        this.name = name;
        this.playtime = playtime;
        this.logoUrl = FORMAT_STEAM_IMAGE_LOGO_URL.format(this.appId, logoHash);
        this.isCompleted = false;
        this.isRecentlyPlayed = false;
    };

    appId: string;
    name: string;
    playtime: number;
    logoUrl: string;
    isCompleted: boolean;
    isRecentlyPlayed: boolean;
}