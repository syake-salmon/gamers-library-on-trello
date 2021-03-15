export { };

declare global {
    interface String {
        format: (...params: string[]) => string;
    }
}

String.prototype.format = function(): string {
    var args: IArguments = arguments;
    return this.replace(/{(\d+)}/g, function(match: string, number: number): string {
        return (typeof args[number] != 'undefined') ? args[number] : match;
    });
};